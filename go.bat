
set EXTRA_ARGS=--inspect-brk
del mySid.os
del data.os
set LOGIN_PORT=7999
node --inspect --experimental-loader=sack.vfs/import.mjs userDbServer.mjs >zz 2>&1
:node run.mjs userDbServer.mjs >zz 2>&1
pause

go.bat