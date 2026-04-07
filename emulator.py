#!/usr/bin/env python3
"""
Эмулятор датчиков, отправляющий данные на Flask-сервер.
Отправляет данные со всех датчиков ОДНОВРЕМЕННО (параллельно).
Запуск: python emulator.py [количество_датчиков] [интервал_сек] [url_сервера]
Пример: python emulator.py 5 5 http://localhost:5000
       python emulator.py 3 10
       python emulator.py 8
"""

import random
import time
import sys
import signal
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

class SensorEmulator:
    def __init__(self, num_sensors=2, server_url="http://localhost:5000", interval=5):
        """
        :param num_sensors: количество датчиков (по умолчанию 2)
        :param server_url: базовый URL сервера (например, http://localhost:5000)
        :param interval: интервал между циклами отправки в секундах
        """
        self.num_sensors = num_sensors
        self.server_url = server_url.rstrip('/')
        self.endpoint = f"{self.server_url}/api/data"
        self.interval = interval
        self.running = True
        
        # Создаем список устройств
        self.devices = [f"emulator {i+1}" for i in range(num_sensors)]
        
        # Для каждого устройства свои базовые параметры с более широким диапазоном
        self.device_profiles = {}
        for i, device_name in enumerate(self.devices):
            # Разные диапазоны для разных датчиков, чтобы данные были интереснее
            base_temp = 18 + (i % 10)  # от 18 до 27 градусов
            self.device_profiles[device_name] = {
                'temp': (base_temp, base_temp + 6),  # диапазон 6 градусов
                'hum': (35 + (i % 30), 65 + (i % 20)),  # от 35% до 85%
                'press': (1005 + (i % 15), 1020 + (i % 10)),  # от 1005 до 1030 гПа
                'trend': 0  # для имитации тренда
            }
        
        # Запоминаем последние значения для плавных изменений
        self.last_values = {}
        for device_name in self.devices:
            profile = self.device_profiles[device_name]
            self.last_values[device_name] = {
                'temperature': (profile['temp'][0] + profile['temp'][1]) / 2,
                'humidity': (profile['hum'][0] + profile['hum'][1]) / 2,
                'pressure': (profile['press'][0] + profile['press'][1]) / 2
            }

    def generate_sensor_data(self, device_name):
        """Генерирует данные для конкретного датчика с учетом тренда и плавности"""
        profile = self.device_profiles[device_name]
        last = self.last_values[device_name]
        
        # Добавляем небольшой тренд для более реалистичных данных
        profile['trend'] += random.uniform(-0.2, 0.2)
        profile['trend'] = max(-3, min(3, profile['trend']))  # ограничиваем тренд
        
        # Плавное изменение температуры (не больше чем на 0.5 градуса за раз)
        temp_change = random.uniform(-0.3, 0.3) + profile['trend'] * 0.1
        new_temp = last['temperature'] + temp_change
        new_temp = max(profile['temp'][0], min(profile['temp'][1], new_temp))
        
        # Плавное изменение влажности
        hum_change = random.uniform(-0.8, 0.8) + profile['trend'] * 0.05
        new_hum = last['humidity'] + hum_change
        new_hum = max(profile['hum'][0], min(profile['hum'][1], new_hum))
        
        # Плавное изменение давления
        press_change = random.uniform(-0.5, 0.5)
        new_press = last['pressure'] + press_change
        new_press = max(profile['press'][0], min(profile['press'][1], new_press))
        
        # Округляем
        temp = round(new_temp, 1)
        humidity = round(new_hum, 1)
        pressure = round(new_press, 1)
        
        # Сохраняем последние значения
        self.last_values[device_name] = {
            'temperature': temp,
            'humidity': humidity,
            'pressure': pressure
        }
        
        return {
            "device_name": device_name,
            "temperature": temp,
            "humidity": humidity,
            "pressure": pressure
        }

    def send_sensor_data(self, device_name):
        """Отправляет данные одного датчика на сервер"""
        payload = self.generate_sensor_data(device_name)
        timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        
        try:
            response = requests.post(self.endpoint, json=payload, timeout=5)
            if response.status_code == 201:
                print(f"[{timestamp}] ✅ {device_name}: T={payload['temperature']:5.1f}°C, "
                      f"H={payload['humidity']:5.1f}%, P={payload['pressure']:6.1f}гПа")
                return True, device_name, payload
            else:
                print(f"[{timestamp}] ❌ {device_name}: Ошибка {response.status_code}")
                return False, device_name, None
        except requests.exceptions.RequestException as e:
            print(f"[{timestamp}] 🔌 {device_name}: Ошибка подключения - {e}")
            return False, device_name, None

    def send_all_data_parallel(self):
        """Отправляет данные со всех датчиков ОДНОВРЕМЕННО (параллельно)"""
        print(f"\n🚀 Цикл отправки {datetime.now().strftime('%H:%M:%S')}")
        print("-" * 80)
        
        # Используем ThreadPoolExecutor для параллельной отправки
        with ThreadPoolExecutor(max_workers=self.num_sensors) as executor:
            # Запускаем отправку для всех датчиков одновременно
            future_to_device = {
                executor.submit(self.send_sensor_data, device): device 
                for device in self.devices
            }
            
            # Собираем результаты
            results = []
            for future in as_completed(future_to_device):
                result = future.result()
                results.append(result)
        
        # Подводим итоги цикла
        success_count = sum(1 for r in results if r[0])
        print("-" * 80)
        print(f"📊 Итог: отправлено {self.num_sensors} датчиков, успешно: {success_count}")
        
        return results

    def run(self):
        """Основной цикл: параллельная отправка данных со всех датчиков"""
        print("=" * 80)
        print("🚀 ЭМУЛЯТОР ДАТЧИКОВ ЗАПУЩЕН")
        print("=" * 80)
        print(f"📊 Количество датчиков: {self.num_sensors}")
        print(f"📡 Интервал между циклами: {self.interval} секунд")
        print(f"🎯 Сервер: {self.endpoint}")
        print(f"📋 Датчики: {', '.join(self.devices)}")
        print(f"⚡ Режим: ОДНОВРЕМЕННАЯ отправка (параллельно)")
        print("=" * 80)
        print()
        
        cycle_count = 0
        
        while self.running:
            cycle_count += 1
            print(f"\n{'='*80}")
            print(f"🔄 ЦИКЛ #{cycle_count}")
            print(f"{'='*80}")
            
            # Отправляем данные со всех датчиков одновременно
            self.send_all_data_parallel()
            
            # Ожидание перед следующим циклом
            if self.running:
                print(f"\n⏰ Ожидание {self.interval} секунд до следующего цикла...")
                for i in range(self.interval, 0, -1):
                    if not self.running:
                        break
                    print(f"   ⏳ {i} сек...", end='\r')
                    time.sleep(1)
                print(" " * 30, end='\r')

    def stop(self):
        self.running = False
        print("\n\n🛑 ЭМУЛЯТОР ОСТАНОВЛЕН")
        print("=" * 80)

def print_usage():
    """Выводит справку по использованию"""
    print("""
ИСПОЛЬЗОВАНИЕ:
    python emulator.py [количество_датчиков] [интервал_сек] [url_сервера]

ПАРАМЕТРЫ:
    количество_датчиков    - количество эмулируемых датчиков (по умолчанию: 2)
    интервал_сек          - интервал между отправками в секундах (по умолчанию: 5)
    url_сервера           - URL сервера для отправки данных (по умолчанию: http://localhost:5000)

ПРИМЕРЫ:
    python emulator.py                 # 2 датчика, интервал 5 сек, localhost:5000
    python emulator.py 5               # 5 датчиков, интервал 5 сек
    python emulator.py 3 10            # 3 датчика, интервал 10 сек
    python emulator.py 8 2 http://192.168.1.100:5000  # 8 датчиков, интервал 2 сек
    python emulator.py 10 3            # 10 датчиков, интервал 3 сек

ОСОБЕННОСТИ:
    - Датчики именуются как "emulator 1", "emulator 2" и т.д.
    - Каждый датчик имеет свой уникальный диапазон значений
    - Данные изменяются плавно, создавая реалистичную картину
    - Отправка данных со всех датчиков происходит параллельно
    """)

def main():
    # Параметры по умолчанию
    num_sensors = 2
    interval = 5
    server_url = "http://localhost:5000"
    
    # Парсинг аргументов командной строки
    args = sys.argv[1:]
    
    # Если запрошена помощь
    if '-h' in args or '--help' in args or 'help' in args:
        print_usage()
        sys.exit(0)
    
    # Разбираем аргументы
    i = 0
    while i < len(args):
        arg = args[i]
        
        # Проверяем, является ли аргумент URL
        if arg.startswith('http'):
            server_url = arg
        # Пытаемся интерпретировать как число (количество датчиков или интервал)
        else:
            try:
                value = int(arg)
                # Если количество датчиков еще не установлено, это num_sensors
                if num_sensors == 2 and interval == 5:
                    # Первое число - количество датчиков
                    num_sensors = value
                elif num_sensors != 2:
                    # Второе число - интервал
                    interval = value
                else:
                    # Если первое число уже было установлено как интервал
                    # (случай: только одно число и это интервал)
                    if num_sensors == 2:
                        interval = value
                        num_sensors = 2
            except ValueError:
                pass
        i += 1
    
    # Дополнительная валидация
    if num_sensors < 1:
        print("❌ Количество датчиков должно быть не менее 1")
        sys.exit(1)
    
    if num_sensors > 100:
        print("⚠️ Предупреждение: большое количество датчиков (>100) может вызвать нагрузку на сервер")
        confirm = input("Продолжить? (y/N): ")
        if confirm.lower() != 'y':
            print("Отмена запуска")
            sys.exit(0)
    
    if interval < 1:
        print("❌ Интервал должен быть не менее 1 секунды")
        sys.exit(1)
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                   КОНФИГУРАЦИЯ ЭМУЛЯТОРА                     ║
╠══════════════════════════════════════════════════════════════╣
║  📊 Количество датчиков: {num_sensors:<46} ║
║  ⏱️  Интервал отправки: {interval} секунд{' ' * (46 - len(str(interval)) - 9)}║
║  🎯 Сервер: {server_url:<46} ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    emulator = SensorEmulator(num_sensors, server_url, interval)

    def signal_handler(sig, frame):
        emulator.stop()
        sys.exit(0)

    # Обработка сигналов для корректного завершения
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        emulator.run()
    except KeyboardInterrupt:
        emulator.stop()
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        emulator.stop()

if __name__ == '__main__':
    main()