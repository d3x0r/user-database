: --inspect-brk
del mySid.os
del data.os
node --inspect --experimental-loader=sack.vfs/import.mjs userDbServer.mjs >zz 2>&1
:node run.mjs userDbServer.mjs >zz 2>&1
pause

go.bat