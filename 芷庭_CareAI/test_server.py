from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/events', methods=['POST'])
def receive_event():
    data = request.json
    print(f"\n[EVENT RECEIVED]")
    print(f"Type: {data.get('event_type')}")
    print(f"Severity: {data.get('severity')}")
    print(f"Time: {data.get('occurred_at')}")
    print(f"Payload: {data}")
    return jsonify({"status": "success"}), 200

@app.route('/api/task_logs', methods=['POST'])
def receive_task():
    data = request.json
    print(f"\n[TASK LOG RECEIVED]")
    print(f"Task: {data.get('task_id')}")
    print(f"Value: {data.get('result_value')}")
    return jsonify({"status": "success"}), 200

if __name__ == '__main__':
    app.run(port=3000)