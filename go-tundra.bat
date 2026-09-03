
set EXTRA_ARGS=--inspect-brk
del mySid-8190.os
del data-8190.os
set LOGIN_PORT=8190
set DSN=sqlite.db
:set NODE_DEBUG=import,esm,*
node --inspect --import sack.vfs/import server/userDbServer.mjs 
:>zz 2>&1
:node run.mjs userDbServer.mjs >zz 2>&1
pause

%0 %*