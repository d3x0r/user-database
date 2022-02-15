
import {UserDbRemote} from "./serviceLogin.mjs";
import {UserDb} from "./userDb.mjs"
import {ObjectStorage} from "node_modules/@d3x0r/object-storage/object-storage-remote.js"


import defaultTowers from "./config.towers.jsox"
let towers = defaultTowers.map(t=>({ response:0, tower:t}) );
let tower = 0;

let remoteStorage = null;

function connectTower( ){
	UserDbRemote.on( "expect", (ws,msg)=>{
		// if I registered a service I would expect expected things....

	})
	UserDbRemote.open( { server:towers[tower]
		, connect( ws) {
			remoteStorage = new ObjectStorage( ws );
			ws.send( {op:"getIndexes"});
		}
	   , authorize(user) {

	   }
	   , processMessage( ws, msg, msg_ ) {
		   switch( msg.op ) {
			case "indexes":

				//const indexes = UserDb.getIndexes();
				// with this, I could just remote sync and use the live database remote?
				//ws.send( {op:"indexes:", ids:indexes.ids } );
				break;
		   }
		   return false;
	   }
	 } );


	tower++; if( tower > towers.length ) tower = 0;
}


function hook( storage ) {
	
}