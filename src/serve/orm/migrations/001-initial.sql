--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE State (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE LocalSource (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE RemoteSource (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE RemoteGroup (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE Queue (
  id            INTEGER PRIMARY KEY,
  state         INTEGER NOT NULL,
  name          TEXT NOT NULL,
  path          TEXT NOT NULL,
  added_at      INTEGER NOT NULL,
  last_updated  INTEGER NOT NULL,
  local_source  INTEGER NOT NULL,
  remote_source INTEGER NOT NULL,
  remote_group  INTEGER NOT NULL,
  FOREIGN KEY(state) REFERENCES State(id),
  FOREIGN KEY(local_source) REFERENCES LocalSource(id),
  FOREIGN KEY(remote_source) REFERENCES RemoteSource(id),
  FOREIGN KEY(remote_group) REFERENCES RemoteGroup(id)
);

INSERT INTO State (name) VALUES ("Pending");
INSERT INTO State (name) VALUES ("Active");
INSERT INTO State (name) VALUES ("Complete");
INSERT INTO State (name) VALUES ("Abort");
INSERT INTO State (name) VALUES ("Skip");

INSERT INTO LocalSource (name) VALUES ("Sonarr");
INSERT INTO LocalSource (name) VALUES ("Radarr");
INSERT INTO LocalSource (name) VALUES ("Manual");

INSERT INTO RemoteSource (name) VALUES ("Unknown");

INSERT INTO RemoteGroup (name) VALUES ("Unknown");

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE Queue;
DROP TABLE State;
DROP TABLE LocalSource;
DROP TABLE RemoteSource;
DROP TABLE RemoteGroup;
