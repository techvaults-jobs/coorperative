-- Platform email log: the app records what it sends; only platform staff read it in the UI.
GRANT SELECT, INSERT ON outbound_messages TO coop_app;
