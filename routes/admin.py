from flask import Blueprint, jsonify, request, session
from models import db, SensorData, DeviceAlias, User
from datetime import datetime
from functools import wraps

admin_bp = Blueprint('admin', __name__)


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function


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
        deleted = SensorData.query.filter_by(device_name=device_name).delete()
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/delete/all", methods=["DELETE"])
@login_required
def admin_delete_all_data():
    try:
        deleted = SensorData.query.delete()
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

        deleted = query.delete()
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