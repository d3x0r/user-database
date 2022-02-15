
import {sack} from "sack.vfs";
import {default as config} from "./config.jsox";

const AsyncFunction = Object.getPrototypeOf( async function() {} ).constructor;

//open( { protocol: "userDatabaseClient"
//      , server : "ws://localhost:8089/"
//    } );

const l = {
	expect : new Map(),
	events : {},
};

function expectUser( ws, msg ){
	const id = sack.Id();
	l.expect.set( id, msg );
	console.log( "login internal service request.... ", id );
	return id;
}

function open( opts ) {
	const protocol = opts?.protocol || "protocol";
	const server = opts.server;
	console.log( "connect with is:", server, protocol );
	var client = sack.WebSocket.Client( server, protocol, { perMessageDeflate: false } );
        
	client.on("open", function (ws)  {
		console.log( "Connected (service identification in process; consult config .jsox files)" );
		//console.log( "ws: ", this ); //  ws is also this
		this.onmessage = ( msg_ )=> {
			const msg = sack.JSOX.parse( msg_ );
			if( msg.op === "addMethod" ) {
				try {
					var f = new AsyncFunction( "Import", "on", msg.code );
					const p = f.call( this, (m)=>import(m), UserDbRemote.on );
					if( opts.connect ) opts.connect( this );
					p.then( ()=>{
						this.on( "expect", msg=>expectUser(this,msg) );
					} );
				} catch( err ) {
					console.log( "Function compilation error:", err,"\n", msg.code );
				}
			}
			else {
				if( this.processMessage && !this.processMessage( msg )  ){
					if( msg.op === "authorize" ) {
						// expect a connection from a user.
						opts.authorize( msg.user );
					}
					else {
						if( opts.processMessage && !this.processMessage( ws, msg, msg_ ) )
							console.log( "unknown message Received:", msg );
					}
				}
			}
       	};
		this.on( "close", function( msg ) {
        		console.log( "opened connection closed" );
        	        //setTimeout( ()=> {console.log( "waited" )}, 3000 )
	        } );
		//client.send( "Connected!" );
		//client.send( msg );
	       	//client.send( msgtext );
                //client.send( "." );
	} );

	client.on( "close", function( msg ) {
      		console.log( "unopened connection closed" );
	} );
	return client;
} 




function handleMessage( ws, msg ) {
	if( msg.op === "addMethod" ) {
		
	}
}

export const UserDbRemote = {
	open(opts) {
		const realOpts = Object.assign( {}, opts );
		realOpts.protocol= "userDatabaseClient";
		//realOpts.
		realOpts.server = realOpts.server || "wss://localhost:8089/";	
		realOpts.authorize = (a)=>{
			console.log( "authorize argument:", a );
		}
		return open(realOpts);
	},
	on( evt, d ) {
		if( "function" === typeof d ) {
			if( evt in l.events ) l.events[evt].push(d);
			else l.events[evt] = [d];
		}else {
			if( evt in l.events ) for( let cb of l.events[evt] ) { const r = cb(d); if(r) return r; }
		}
	}
}

// return
// return UserDbRemote;//"this usually isn't legal?";
