
import {sack} from "sack.vfs";

const AsyncFunction = Object.getPrototypeOf( async function() {} ).constructor;

//open( { protocol: "userDatabaseClient"
//      , server : "ws://localhost:8089/"
//      , servePort : // port this service is serving on.. 
//    } );

const l = {
	events : {},
};


function open( opts ) {
	const protocol = opts?.protocol || "protocol";
	const server = opts.server;
	//console.log( "connect with is:", server, protocol );
	var client = sack.WebSocket.Client( server, protocol, { perMessageDeflate: false } );
    client.opts = opts;
	client.on("open", function ()  {
		const ws = this;
		console.log( "Connected (service identification in process; consult config .jsox files)", opts.configPath || "<current PWD>" );
		//console.log( "ws: ", this ); //  ws is also this
		this.onmessage = ( msg_ )=> {
			const msg = sack.JSOX.parse( msg_ );
			if( msg.op === "addMethod" ) {
				try {
					var f = new AsyncFunction( "Import", "on", "PORT", msg.code );
					const p = f.call( ws, (m)=>import(m), UserDbRemote.on, opts.port );
					p.then( ()=>{						
						if( opts.connect ) opts.connect( ws );
					} );
				} catch( err ) {
					console.log( "Function compilation error:", err,"\n", msg.code );
				}
			}
			else {
				if( this.processMessage && !this.processMessage( msg )  ){
					if( opts.processMessage && !opts.processMessage( ws, msg, msg_ ) )
						console.log( "unknown message Received:", msg );
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

	client.on( "close", function( code, reason ) {
      		console.log( "unopened connection closed", code, reason );
	} );
	return client;
} 


export const UserDbRemote = {
	open(opts) {
		const realOpts = Object.assign( {}, opts );
		realOpts.protocol= "userDatabaseClient";
		//realOpts.
		const port = Number(process.env.LOGIN_PORT) || Number(process.env.PORT) || Number(process.argv[2])||8089 ;

		realOpts.server = realOpts.server || "ws://localhost:"+port+"/";	
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
