from flask import Blueprint, jsonify, request, session
from models import db, SensorData, DeviceAlias, User, SystemSettings, DeviceOrder
from datetime import datetime
from functools import wraps
import json

admin_bp = Blueprint('admin', __name__)


def remove_device_completely(device_name):
    """Удалить датчик полностью из программы"""
    try:
        # 1. Удалить alias датчика
        DeviceAlias.query.filter_by(device_name=device_name).delete(synchronize_session=False)
        
        # 2. Обновить device_order - переделать JSON списки без удаленного датчика
        all_orders = DeviceOrder.query.all()
        for order_record in all_orders:
            try:
                if order_record.device_order:
                    device_list = json.loads(order_record.device_order)
                    if isinstance(device_list, list) and device_name in device_list:
                        # Создать новый список без удаленного датчика
                        new_list = [d for d in device_list if d != device_name]
                        # Обновить запись
                        order_record.device_order = json.dumps(new_list)
                        # Явно добавить в сессию
                        db.session.add(order_record)
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Error processing device_order: {e}")
        
        # Явно выполнить все изменения
        db.session.flush()
        
    except Exception as e:
        print(f"Error in remove_device_completely: {e}")
        raise


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function


def get_setting(key, default=None):
    """Получить значение настройки"""
    setting = SystemSettings.query.filter_by(key=key).first()
    return setting.value if setting else default


def set_setting(key, value):
    """Установить значение настройки"""
    setting = SystemSettings.query.filter_by(key=key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSettings(key=key, value=value)
        db.session.add(setting)
    db.session.commit()


def init_default_settings():
    """Инициализировать настройки по умолчанию"""
    defaults = {
        'timezone': 'UTC+4',
        'temperature_unit': 'celsius',
        'pressure_unit': 'hpa',
        'offline_timeout': '60'
    }
    for key, value in defaults.items():
        existing = SystemSettings.query.filter_by(key=key).first()
        if not existing:
            set_setting(key, value)


@admin_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter_by(username=username).first()

    if user and user.is_active and user.check_password(password):
        session["user_id"] = user.id
        session["username"] = user.username
        return jsonify({"status": "success", "message": "Login successful"}), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401


@admin_bp.route("/logout", methods=["POST"])
def admin_logout():
    session.pop("user_id", None)
    session.pop("username", None)
    return jsonify({"status": "success", "message": "Logged out"}), 200


@admin_bp.route("/check", methods=["GET"])
def admin_check():
    user_id = session.get("user_id")
    if user_id:
        user = User.query.get(user_id)
        if user and user.is_active:
            return jsonify({"authenticated": True, "username": user.username}), 200
    return jsonify({"authenticated": False}), 200


@admin_bp.route("/change-password", methods=["POST"])
@login_required
def admin_change_password():
    data = request.get_json()
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    if not current_password or not new_password:
        return jsonify({"error": "Требуются текущий и новый пароль"}), 400

    user_id = session.get("user_id")
    user = User.query.get(user_id)

    if not user or not user.check_password(current_password):
        return jsonify({"error": "Неверный текущий пароль"}), 401

    if len(new_password) < 3:
        return jsonify({"error": "Новый пароль должен содержать минимум 3 символа"}), 400

    user.set_password(new_password)
    db.session.commit()

    return jsonify({"status": "success", "message": "Пароль успешно изменён"}), 200


@admin_bp.route("/delete/device/<device_name>", methods=["DELETE"])
@login_required
def admin_delete_device_data(device_name):
    try:
        deleted = SensorData.query.filter_by(device_name=device_name).delete(synchronize_session=False)
        
        # Полностью удалить датчик из программы
        remove_device_completely(device_name)
        
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/delete/all", methods=["DELETE"])
@login_required
def admin_delete_all_data():
    try:
        deleted = SensorData.query.delete(synchronize_session=False)
        
        # Удалить все aliases и очистить порядок устройств
        DeviceAlias.query.delete(synchronize_session=False)
        for order_record in DeviceOrder.query.all():
            order_record.device_order = "[]"
            db.session.add(order_record)
        
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/delete/range", methods=["DELETE"])
@login_required
def admin_delete_range():
    data = request.get_json()
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    device_name = data.get("device_name")

    try:
        query = SensorData.query
        if device_name:
            query = query.filter_by(device_name=device_name)
        if start_date and end_date:
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            query = query.filter(
                SensorData.timestamp >= start, SensorData.timestamp <= end
            )

        deleted = query.delete(synchronize_session=False)
        
        # Необходимо выполнить flush() перед проверкой остатков
        db.session.flush()
        
        # Если удаляются все данные конкретного датчика, полностью его удалить
        if device_name:
            remaining_data = SensorData.query.filter_by(device_name=device_name).first()
            if not remaining_data:
                remove_device_completely(device_name)
        else:
            # Если удаляются все данные без фильтра, очистить все orphaned датчики
            # Получить все оставшиеся датчики ИЗ БД после удаления
            remaining_devices = db.session.query(SensorData.device_name).distinct().all()
            existing_devices = set(device[0] for device in remaining_devices)
            
            # Получить все aliases
            all_aliases = DeviceAlias.query.all()
            for alias in all_aliases:
                if alias.device_name not in existing_devices:
                    remove_device_completely(alias.device_name)
        
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/rename/device", methods=["POST"])
@login_required
def admin_rename_device():
    data = request.get_json()
    device_name = data.get("device_name")
    display_name = data.get("display_name")

    if not device_name or not display_name:
        return jsonify({"error": "Missing device_name or display_name"}), 400

    existing = SensorData.query.filter_by(device_name=device_name).first()
    if not existing:
        return jsonify({"error": "Device not found"}), 404

    display_name = display_name.strip()
    if not display_name:
        return jsonify({"error": "Display name cannot be empty"}), 400

    try:
        alias = DeviceAlias.query.filter_by(device_name=device_name).first()
        if alias:
            alias.display_name = display_name
        else:
            alias = DeviceAlias(device_name=device_name, display_name=display_name)
            db.session.add(alias)

        db.session.commit()
        return (
            jsonify(
                {
                    "status": "success",
                    "device_name": device_name,
                    "display_name": display_name,
                }
            ),
            200,
        )
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/aliases", methods=["GET"])
@login_required
def admin_get_aliases():
    aliases = DeviceAlias.query.all()
    return jsonify([alias.to_dict() for alias in aliases]), 200


@admin_bp.route("/export", methods=["GET"])
@login_required
def admin_export_data():
    try:
        all_data = SensorData.query.order_by(SensorData.timestamp.asc()).all()
        data_list = [d.to_dict() for d in all_data]

        all_aliases = DeviceAlias.query.all()
        aliases_list = [alias.to_dict() for alias in all_aliases]

        export = {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "aliases": aliases_list,
            "sensor_data": data_list,
        }

        return jsonify(export), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/import", methods=["POST"])
@login_required
def admin_import_data():
    data = request.get_json()

    if not data:
        return jsonify({"error": "No data provided"}), 400

    imported_data = 0
    imported_aliases = 0

    try:
        if "aliases" in data:
            for alias_data in data["aliases"]:
                device_name = alias_data.get("device_name")
                display_name = alias_data.get("display_name")
                if device_name and display_name:
                    existing = DeviceAlias.query.filter_by(
                        device_name=device_name
                    ).first()
                    if existing:
                        existing.display_name = display_name
                    else:
                        alias = DeviceAlias(
                            device_name=device_name, display_name=display_name
                        )
                        db.session.add(alias)
                    imported_aliases += 1

        if "sensor_data" in data:
            for record in data["sensor_data"]:
                device_name = record.get("device_name")
                temperature = record.get("temperature")
                humidity = record.get("humidity")
                pressure = record.get("pressure")
                timestamp_str = record.get("timestamp")

                if not all(
                    [
                        device_name,
                        temperature is not None,
                        humidity is not None,
                        pressure is not None,
                    ]
                ):
                    continue

                entry = SensorData(
                    device_name=device_name,
                    temperature=float(temperature),
                    humidity=float(humidity),
                    pressure=float(pressure),
                )

                if timestamp_str:
                    try:
                        entry.timestamp = datetime.fromisoformat(timestamp_str)
                    except ValueError:
                        pass

                db.session.add(entry)
                imported_data += 1

        db.session.commit()
        return (
            jsonify(
                {
                    "status": "success",
                    "imported_data": imported_data,
                    "imported_aliases": imported_aliases,
                }
            ),
            200,
        )
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ===== SYSTEM SETTINGS =====

@admin_bp.route("/settings", methods=["GET"])
def get_settings():
    """Получить все настройки системы (общедоступно)"""
    try:
        settings = SystemSettings.query.all()
        result = {}
        for setting in settings:
            result[setting.key] = setting.value
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/settings", methods=["POST"])
@login_required
def update_settings():
    """Обновить настройки системы"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        allowed_keys = ['timezone', 'temperature_unit', 'pressure_unit', 'offline_timeout']
        updated = []

        for key, value in data.items():
            if key not in allowed_keys:
                continue

            # Валидация
            if key == 'timezone':
                # Проверяем формат UTC±N или число [-14, 14]
                if not (value.startswith('UTC') or (value.lstrip('-').isdigit() and -14 <= int(value) <= 14)):
                    continue
            elif key == 'temperature_unit':
                if value not in ['celsius', 'fahrenheit']:
                    continue
            elif key == 'pressure_unit':
                if value not in ['hpa', 'mmhg', 'inhg', 'psi']:
                    continue
            elif key == 'offline_timeout':
                try:
                    timeout = int(value)
                    if timeout < 5 or timeout > 3600:
                        continue
                except (ValueError, TypeError):
                    continue

            set_setting(key, value)
            updated.append(key)

        return jsonify({"status": "success", "updated": updated}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
