[Unit]
Description=TinyClaw Chat Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=__RUN_USER__
Group=__RUN_USER__
WorkingDirectory=__INSTALL_DIR__/backend
Environment=PORT=__CHAT_PORT__
Environment=NODE_ENV=production
Environment=CLAWUI_DATA_DIR=__CLAWUI_DATA_DIR__
ExecStart=/usr/bin/env node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
