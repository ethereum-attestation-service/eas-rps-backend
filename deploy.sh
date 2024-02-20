LOCAL_DIR="./"
REMOTE_DIR="root@149.28.39.24:rps-backend"

# Rsync command to sync files, excluding specific directories
rsync -avz --progress --exclude='bin' --exclude='node_modules' $LOCAL_DIR $REMOTE_DIR

echo "Sync completed."



# Restart pm2 on target machine
ssh root@149.28.39.24 ". ~/.nvm/nvm.sh && . ~/.profile &&. ~/.bashrc  && pm2 restart ~/rps-backend/ecosystem.config.js"
