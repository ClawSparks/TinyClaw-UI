[Unit]
Description=TinyClaw Control Center
After=network-online.target openclaw-gateway.service
Wants=network-online.target

[Service]
Type=simple
User=__RUN_USER__
Group=__RUN_USER__
WorkingDirectory=__INSTALL_DIR__/control-center
Environment=HOME=__RUN_HOME__
Environment=UI_MODE=true
Environment=UI_HOST=0.0.0.0
Environment=UI_PORT=__CONTROL_CENTER_PORT__
Environment=GATEWAY_URL=__GATEWAY_URL__
Environment=READONLY_MODE=false
Environment=APPROVAL_ACTIONS_ENABLED=true
Environment=APPROVAL_ACTIONS_DRY_RUN=false
Environment=IMPORT_MUTATION_ENABLED=true
Environment=IMPORT_MUTATION_DRY_RUN=false
Environment=LOCAL_TOKEN_AUTH_REQUIRED=false
Environment=LOCAL_API_TOKEN=__LOCAL_API_TOKEN__
ExecStart=/usr/bin/env node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
