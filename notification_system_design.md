# Notification System Design

## Stage 1

A notification platform needs to do a few simple things. Students should be able to see their notifications, mark them as read, and delete them.

Here are the API endpoints:

**See all notifications**

```
GET /api/notifications
Authorization: Bearer <token>
```

```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "Google is hiring",
      "isRead": false,
      "createdAt": "2026-05-11T10:00:00Z"
    }
  ]
}
```

**Mark one notification as read**

```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

```json
{
  "message": "notification marked as read"
}
```

**Mark all as read**

```
PATCH /api/notifications/read-all
Authorization: Bearer <token>
```

```json
{
  "message": "all notifications marked as read"
}
```

**Delete a notification**

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

```json
{
  "message": "notification deleted"
}
```

### How real-time notifications work

When a student opens the app a live connection is made between their browser and the server using WebSockets. When a new notification is created the server sends it through that connection. The student sees it instantly.

```
WS /ws/notifications
Authorization: Bearer <token>
```

When something new comes in the server sends:

```json
{
  "event": "new_notification",
  "data": {
    "id": "uuid",
    "type": "Placement",
    "message": "Google is hiring",
    "isRead": false,
    "createdAt": "2026-05-11T10:00:00Z"
  }
}
```

---

## Stage 2

### What database to use and why

PostgreSQL is a good choice. Notifications have a fixed structure and PostgreSQL handles this kind of data well. It is reliable and easy to query.

### The schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studentID INT NOT NULL,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  isRead BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### What goes wrong as data grows

As data grows things slow down. The database scans through every row to find a student's notifications. Many students loading notifications at the same time slows things down even more. Storage grows because every notification is saved.

### How to deal with it

Adding an index on studentID and createdAt helps. Caching notifications reduces the load. Old notifications can be cleaned up.

### Queries

Fetch all notifications for a student:

```sql
SELECT * FROM notifications
WHERE studentID = $1
ORDER BY createdAt DESC;
```

Mark one as read:

```sql
UPDATE notifications
SET isRead = true
WHERE id = $1 AND studentID = $2;
```

Mark all as read:

```sql
UPDATE notifications
SET isRead = true
WHERE studentID = $1 AND isRead = false;
```

Delete one:

```sql
DELETE FROM notifications
WHERE id = $1 AND studentID = $2;
```

---

## Stage 3

### Is the query correct

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

Yes it is correct. It is slow because there is no index on studentID. So the database looks at every single row in the table and checks if it belongs to student 1042 and if it is unread. When the table has 5 million rows that takes a long time.

### How to fix it

Add an index:

```sql
CREATE INDEX idx_notifications_student_read_date
ON notifications (studentID, isRead, createdAt DESC);
```

### Should we index every column to be safe

No that is a bad idea. Every index makes writes slower. You only add indexes where they help.

### Find students who got a placement notification in the last 7 days

```sql
SELECT DISTINCT studentID FROM notifications
WHERE type = 'Placement'
AND createdAt >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### What is actually happening

Every time a student loads a page the app fetches their notifications from the database. Most of the time notifications have not changed.

### Option 1 - Store recent notifications temporarily

Save the result in Redis. The next time the student loads the page read from Redis instead of going to the database. It is much faster.

The downside is that if something goes wrong with clearing the cache a student might briefly see old notifications. Also Redis is another thing you need to run and manage.

### Option 2 - Do not load everything at once

Only load the first 20 notifications. If the student wants to see older ones they can scroll or click to load more.

This is simple and works well. The only downside is students cannot see everything at once but that is usually fine.

### Option 3 - Only load the unread count on page load

Fetch how many unread notifications there are. The full list only loads when the student clicks to open notifications.

This saves a lot of database work for students who never even open the notification panel.

The best approach is to combine all three.

---

## Stage 5

### What is wrong with the current code

The code goes through all 50000 students one by one. If the email API fails some students get the notification and some do not. There is no way to know exactly who was missed without going through everything manually.

There is also a problem with saving to the database and sending the email being tied together. These two things should be handled separately.

### What to do about the 200 failed emails

Since nothing was tracked there is no clean list of who failed. You would have to send again to everyone which means some students get it twice.

### Better design

Instead of doing everything inside the loop directly, push each student into a queue as a job. Workers pick up jobs from the queue and process them. If a job fails it gets retried automatically. The database save happens first since that is the most important part. The email is sent after and if it fails it just gets retried on its own without affecting the in-app notification.

```python
function notify_all(student_ids, message):
    for student_id in student_ids:
        enqueue_job("send_notification", {
            student_id: student_id,
            message: message
        })

function process_notification_job(job):
    student_id = job.student_id
    message = job.message

    saved = save_to_db(student_id, message)
    if not saved:
        raise Exception("db failed, will retry")

    push_to_app(student_id, message)

    email_sent = send_email(student_id, message)
    if not email_sent:
        enqueue_job("retry_email", { student_id: student_id, message: message })
```

The database and the email are now separate. If the email fails the in-app notification is already there. The queue handles retries so no student gets silently skipped.

---

## Stage 6

### How priority is decided

Each notification gets a score. The score is based on two things, what type it is and how recent it is.

Placement gets a weight of 3 because it matters the most. Result gets 2. Event gets 1.

The score is calculated like this:

```
score = typeWeight * 10000000000000 + timestamp in milliseconds
```

The big number makes sure type always wins over recency. So a Placement from yesterday will always rank above a Result from today. Within the same type the newer one comes first.

### How the top 10 is kept up to date efficiently

I keep a heap of size 10. As each notification comes in I calculate its score. If there are fewer than 10 items in the heap it just gets added. If there are already 10 and the new one has a higher score than the lowest scoring one in the heap, the lowest one gets removed and the new one takes its place.

This way the heap always holds the top 10. It never needs to sort the full list. Each new notification is just compared against the worst in the top 10 and swapped in if it is better.

As new notifications keep arriving the same thing happens. The heap stays at 10 items and always reflects the most important unread notifications at that moment.
