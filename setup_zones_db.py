import sqlite3

def update_schema():
    try:
        conn = import os
        db_path = os.path.join(os.path.dirname(__file__), 'data', 'oikos.db')
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create family_zones table
        cursor.execute("""
          CREATE TABLE IF NOT EXISTS family_zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            zone_type TEXT NOT NULL CHECK(zone_type IN ('safe', 'school', 'danger')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          );
        """)
        
        # Check if lat exists in child_locations, if not add it
        cursor.execute("PRAGMA table_info(child_locations)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'lat' not in columns:
            cursor.execute("ALTER TABLE child_locations ADD COLUMN lat REAL DEFAULT 0.0;")
            cursor.execute("ALTER TABLE child_locations ADD COLUMN lng REAL DEFAULT 0.0;")
            
        conn.commit()
        conn.close()
        print("Updated oikos.db successfully.")
    except Exception as e:
        print(f"Error updating oikos.db: {e}")

    # Update db.js
    try:
        with open('/home/tankiso/Music/Digital-Parent-V4/server/db.js', 'r') as f:
            content = f.read()

        table_sql = """
      CREATE TABLE IF NOT EXISTS family_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        zone_type TEXT NOT NULL CHECK(zone_type IN ('safe', 'school', 'danger')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
"""
        if "family_zones" not in content:
            content = content.replace(
                "CREATE TABLE IF NOT EXISTS child_locations (",
                table_sql + "\n      CREATE TABLE IF NOT EXISTS child_locations ("
            )
            # Find the child_locations definition and add lat, lng
            content = content.replace(
                "location_type TEXT NOT NULL,",
                "location_type TEXT NOT NULL,\n        lat REAL DEFAULT 0.0,\n        lng REAL DEFAULT 0.0,"
            )
            with open('/home/tankiso/Music/Digital-Parent-V4/server/db.js', 'w') as f:
                f.write(content)
            print("Updated db.js successfully.")
    except Exception as e:
        print(f"Error updating db.js: {e}")

if __name__ == "__main__":
    update_schema()
