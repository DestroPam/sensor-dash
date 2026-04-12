from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta

db = SQLAlchemy()

# Функция для получения текущего времени UTC+4
def utc_plus_4_now():
    return datetime.utcnow() + timedelta(hours=4)


class SensorData(db.Model):
    __tablename__ = "sensor_data"
    id = db.Column(db.Integer, primary_key=True)
    device_name = db.Column(db.String(50), nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    humidity = db.Column(db.Float, nullable=False)
    pressure = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=utc_plus_4_now, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "device_name": self.device_name,
            "temperature": self.temperature,
            "humidity": self.humidity,
            "pressure": self.pressure,
            "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
        }


class DeviceOrder(db.Model):
    __tablename__ = "device_order"
    id = db.Column(db.Integer, primary_key=True)
    location = db.Column(db.String(50), nullable=False, unique=True)  # 'list' или 'grid'
    device_order = db.Column(db.Text, nullable=False, default="[]")

    def to_dict(self):
        import json
        return {
            "id": self.id,
            "location": self.location,
            "device_order": json.loads(self.device_order)
        }