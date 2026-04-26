from flask import Blueprint, jsonify, request
from models import db, SensorData, DeviceAlias, utc_plus_4_now
from datetime import datetime, timedelta
from functools import wraps

sensors_bp = Blueprint('sensors', __name__)


def get_display_name(device_name):
    alias = DeviceAlias.query.filter_by(device_name=device_name).first()
    return alias.display_name if alias else device_name


def sensor_to_dict_with_display(sensor_obj):
    result = sensor_obj.to_dict()
    display_name = get_display_name(result["device_name"])
    result["display_name"] = display_name
    return result


@sensors_bp.route("/data", methods=["POST"])
def receive_data():
    data = request.get_json()

    if not data or "device_name" not in data:
        return jsonify({"error": "Missing device_name"}), 400

    temp = None
    hum = None
    press = None

    try:
        if "temperature" in data and data["temperature"] is not None:
            temp = float(data["temperature"])
        if "humidity" in data and data["humidity"] is not None:
            hum = float(data["humidity"])
        if "pressure" in data and data["pressure"] is not None:
            press = float(data["pressure"])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid numeric values"}), 400

    if temp is None and hum is None and press is None:
        return jsonify({"error": "At least one metric required"}), 400

    sensor_entry = SensorData(
        device_name=data["device_name"], temperature=temp, humidity=hum, pressure=press
    )
    db.session.add(sensor_entry)
    db.session.commit()

    return jsonify({"status": "success", "id": sensor_entry.id}), 201


@sensors_bp.route("/data/latest", methods=["GET"])
def get_latest_data():
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
            result.append(sensor_to_dict_with_display(latest))

    return jsonify(result)


@sensors_bp.route("/data/device/<device_name>", methods=["GET"])
def get_device_data(device_name):
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
        since = utc_plus_4_now() - timedelta(hours=hours)
        query = query.filter(SensorData.timestamp >= since)

    if sort_order == "desc":
        query = query.order_by(SensorData.timestamp.desc())
    else:
        query = query.order_by(SensorData.timestamp.asc())

    data = query.limit(limit).all()
    return jsonify([sensor_to_dict_with_display(d) for d in data])


@sensors_bp.route("/data/all", methods=["GET"])
def get_all_data():
    limit = request.args.get("limit", default=100, type=int)
    offset = request.args.get("offset", default=0, type=int)
    data = (
        SensorData.query.order_by(SensorData.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return jsonify([sensor_to_dict_with_display(d) for d in data])


@sensors_bp.route("/devices", methods=["GET"])
def get_devices():
    devices = db.session.query(SensorData.device_name).distinct().all()
    devices = [d[0] for d in devices]

    result = []
    for device in devices:
        display_name = get_display_name(device)
        result.append({"device_name": device, "display_name": display_name})

    return jsonify(result)


@sensors_bp.route("/data/range", methods=["GET"])
def get_date_range():
    first_record = SensorData.query.order_by(SensorData.timestamp.asc()).first()
    last_record = SensorData.query.order_by(SensorData.timestamp.desc()).first()

    return jsonify(
        {
            "min_date": first_record.timestamp.isoformat() if first_record else None,
            "max_date": last_record.timestamp.isoformat() if last_record else None,
        }
    )


@sensors_bp.route("/data/count", methods=["GET"])
def get_data_count():
    count = SensorData.query.count()
    return jsonify({"count": count}), 200