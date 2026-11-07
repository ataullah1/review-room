ALTER TABLE app."Project" ADD COLUMN description varchar(2000), ADD COLUMN "dueDate" date;
GRANT UPDATE(name,description,"dueDate") ON app."Project" TO review_room_user;
