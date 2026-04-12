from flask import (
    Flask,
    jsonify,
    request,
    render_template,
    session,
    redirect,
    url_for,
)
from flask_cors import CORS
from config import Config
from models import db, SensorData, DeviceOrder
from datetime import datetime, timedelta
from functools import wraps
import json

app = Flask(__name__)
app.config.from_object(Config)
app.config["SECRET_KEY"] = "your-secret-key-change-this-in-production"
CORS(app)

db.init_app(app)

with app.app_context():
    db.create_all()

# Админские учетные данные
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin"


def login_required(f):
    """Декоратор для проверки авторизации"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("logged_in"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)

    return decorated_function




# --- API endpoints ---
@app.route("/api/data", methods=["POST"])
def receive_data():
    """Принимает данные от эмулятора датчиков"""
    data = request.get_json()
    required = ["device_name", "temperature", "humidity", "pressure"]

    if not data or not all(field in data for field in required):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        temp = float(data["temperature"])
        hum = float(data["humidity"])
        press = float(data["pressure"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numeric values"}), 400

    sensor_entry = SensorData(
        device_name=data["device_name"], temperature=temp, humidity=hum, pressure=press
    )
    db.session.add(sensor_entry)
    db.session.commit()

    return jsonify({"status": "success", "id": sensor_entry.id}), 201


@app.route("/api/data/latest", methods=["GET"])
def get_latest_data():
    """Возвращает последние показания для каждого устройства"""
    devices = db.session.query(SensorData.device_name).distinct().all()
    devices = [d[0] for d in devices]

    result = []
    for device in devices:
        latest = (
            SensorData.query.filter_by(device_name=device)
            .order_by(SensorData.timestamp.desc())
            .first()
        )
        if latest:
            result.append(latest.to_dict())

    return jsonify(result)


@app.route("/api/data/device/<device_name>", methods=["GET"])
def get_device_data(device_name):
    """Возвращает историю показаний для конкретного устройства"""
    limit = request.args.get("limit", default=1000, type=int)
    sort_order = request.args.get("sort", default="asc", type=str)

    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    hours = request.args.get("hours", type=int)

    query = SensorData.query.filter_by(device_name=device_name)

    if start_date and end_date:
        try:
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            query = query.filter(
                SensorData.timestamp >= start, SensorData.timestamp <= end
            )
        except ValueError:
            pass
    elif hours:
        since = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(SensorData.timestamp >= since)

    if sort_order == "desc":
        query = query.order_by(SensorData.timestamp.desc())
    else:
        query = query.order_by(SensorData.timestamp.asc())

    data = query.limit(limit).all()
    return jsonify([d.to_dict() for d in data])


@app.route("/api/data/all", methods=["GET"])
def get_all_data():
    """Возвращает все данные с пагинацией"""
    limit = request.args.get("limit", default=100, type=int)
    offset = request.args.get("offset", default=0, type=int)
    data = (
        SensorData.query.order_by(SensorData.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return jsonify([d.to_dict() for d in data])


@app.route("/api/devices", methods=["GET"])
def get_devices():
    """Возвращает список всех устройств"""
    devices = db.session.query(SensorData.device_name).distinct().all()
    return jsonify([d[0] for d in devices])


@app.route("/api/data/range", methods=["GET"])
def get_date_range():
    """Возвращает минимальную и максимальную дату в БД"""
    first_record = SensorData.query.order_by(SensorData.timestamp.asc()).first()
    last_record = SensorData.query.order_by(SensorData.timestamp.desc()).first()

    return jsonify(
        {
            "min_date": first_record.timestamp.isoformat() if first_record else None,
            "max_date": last_record.timestamp.isoformat() if last_record else None,
        }
    )


# --- Админ панель API ---
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session["logged_in"] = True
        return jsonify({"status": "success", "message": "Login successful"}), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("logged_in", None)
    return jsonify({"status": "success", "message": "Logged out"}), 200


@app.route("/api/admin/check", methods=["GET"])
def admin_check():
    if session.get("logged_in"):
        return jsonify({"authenticated": True}), 200
    return jsonify({"authenticated": False}), 200


@app.route("/api/admin/delete/device/<device_name>", methods=["DELETE"])
@login_required
def admin_delete_device_data(device_name):
    try:
        deleted = SensorData.query.filter_by(device_name=device_name).delete()
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/delete/all", methods=["DELETE"])
@login_required
def admin_delete_all_data():
    try:
        deleted = SensorData.query.delete()
        db.session.commit()
        return jsonify({"status": "success", "deleted_count": deleted}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/delete/range", methods=["DELETE"])
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


@app.route("/")
def index():
    return render_template('index.html')


@app.route("/api/data/count", methods=["GET"])
def get_data_count():
    """Возвращает общее количество записей в БД"""
    count = SensorData.query.count()
    return jsonify({"count": count}), 200


# --- API endpoints для порядка датчиков ---
@app.route("/api/device-order/<location>", methods=["GET"])
def get_device_order(location):
    """Возвращает сохраненный порядок датчиков для конкретной области (list или grid)"""
    if location not in ['list', 'grid']:
        return jsonify({"error": "Invalid location"}), 400

    order = DeviceOrder.query.filter_by(location=location).first()
    if order:
        return jsonify(json.loads(order.device_order)), 200
    return jsonify([]), 200


@app.route("/api/device-order/<location>", methods=["POST"])
def save_device_order(location):
    """Сохраняет новый порядок датчиков для конкретной области (list или grid)"""
    if location not in ['list', 'grid']:
        return jsonify({"error": "Invalid location"}), 400

    data = request.get_json()
    device_list = data.get("device_order", [])

    # Удаляем дубликаты
    device_list = list(dict.fromkeys(device_list))

    try:
        order = DeviceOrder.query.filter_by(location=location).first()
        if order:
            order.device_order = json.dumps(device_list)
        else:
            order = DeviceOrder(location=location, device_order=json.dumps(device_list))
            db.session.add(order)

        db.session.commit()
        return jsonify({"status": "success", "device_order": device_list}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
