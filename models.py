from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# Функция для получения текущего времени UTC+4
def utc_plus_4_now():
    return datetime.utcnow() + timedelta(hours=4)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_plus_4_now)

    def set_password(self, password):
        """Установить хеш пароля"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Проверить пароль"""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "is_active": self.is_active,
            "created_at": (
                self.created_at.strftime("%Y-%m-%d %H:%M:%S")
                if self.created_at
                else None
            ),
        }


class SensorData(db.Model):
    __tablename__ = "sensor_data"
    id = db.Column(db.Integer, primary_key=True)
    device_name = db.Column(db.String(50), nullable=False)
    temperature = db.Column(db.Float, nullable=True)
    humidity = db.Column(db.Float, nullable=True)
    pressure = db.Column(db.Float, nullable=True)
    timestamp = db.Column(db.DateTime, default=utc_plus_4_now, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "device_name": self.device_name,
            "temperature": self.temperature,
            "humidity": self.humidity,
            "pressure": self.pressure,
            "timestamp": (
                self.timestamp.strftime("%Y-%m-%d %H:%M:%S") if self.timestamp else None
            ),
        }


class DeviceAlias(db.Model):
    __tablename__ = "device_alias"
    id = db.Column(db.Integer, primary_key=True)
    device_name = db.Column(
        db.String(50), nullable=False, unique=True
    )  # оригинальное имя
    display_name = db.Column(db.String(50), nullable=False)  # отображаемое имя
    created_at = db.Column(db.DateTime, default=utc_plus_4_now)

    def to_dict(self):
        return {
            "id": self.id,
            "device_name": self.device_name,
            "display_name": self.display_name,
            "created_at": (
                self.created_at.strftime("%Y-%m-%d %H:%M:%S")
                if self.created_at
                else None
            ),
        }


class DeviceOrder(db.Model):
    __tablename__ = "device_order"
    id = db.Column(db.Integer, primary_key=True)
    location = db.Column(
        db.String(50), nullable=False, unique=True
    )  # 'list' или 'grid'
    device_order = db.Column(db.Text, nullable=False, default="[]")

    def to_dict(self):
        import json

        return {
            "id": self.id,
            "location": self.location,
            "device_order": json.loads(self.device_order),
        }
