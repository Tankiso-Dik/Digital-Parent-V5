import sqlite3

def update_schema():
    # 1. Update oikos.db directly
    try:
        conn = import os
        db_path = os.path.join(os.path.dirname(__file__), 'data', 'oikos.db')
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
          CREATE TABLE IF NOT EXISTS emergency_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            app_type TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          );
        """)
        conn.commit()
        conn.close()
        print("Updated oikos.db successfully.")
    except Exception as e:
        print(f"Error updating oikos.db: {e}")

    # 2. Update db.js for future migrations
    try:
        with open('/home/tankiso/Music/Digital-Parent-V4/server/db.js', 'r') as f:
            content = f.read()

        table_sql = """
      CREATE TABLE IF NOT EXISTS emergency_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
"""
        if "emergency_requests" not in content:
            content = content.replace(
                "CREATE TABLE IF NOT EXISTS child_app_usage",
                table_sql + "\n      CREATE TABLE IF NOT EXISTS child_app_usage"
            )
            with open('/home/tankiso/Music/Digital-Parent-V4/server/db.js', 'w') as f:
                f.write(content)
            print("Updated db.js successfully.")
    except Exception as e:
        print(f"Error updating db.js: {e}")

if __name__ == "__main__":
    update_schema()
