
#export EXTRA_ARGS=
#export EXTRA_ARGS=--inspect-brk

#rm mySid.os
#rm data.os
#export SSL_PATH=/home/sideplayr/work/javascript/game-platform/certgen
export SSL_PATH=/etc/letsencrypt/live/app.d3x0r.org
export LOGIN_PORT=8399
#set NODE_DEBUG=import,esm,*
export DSN=mysql-user-database
rm zz.4
mv zz.3 zz.4
mv zz.2 zz.3
mv zz.1 zz.2
mv zz zz.1
/home/sideplayr/.nvm/versions/node/v22.3.0/bin/node --import sack.vfs/import server/userDbServer.mjs >zz 2>&1
#node run.mjs userDbServer.mjs >zz 2>&1
#pause

#./go.sh
