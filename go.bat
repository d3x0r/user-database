
set EXTRA_ARGS=--inspect-brk
del mySid.os
del data.os
set LOGIN_PORT=7999
:set NODE_DEBUG=import,esm,*
node --inspect --import=sack.vfs/import server/userDbServer.mjs >zz 2>&1
:node run.mjs userDbServer.mjs >zz 2>&1
pause

go.bat