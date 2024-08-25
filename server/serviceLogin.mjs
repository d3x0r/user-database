
import {sack} from "sack.vfs";
const JSOX = sack.JSOX;
import {Events} from "sack.vfs/Events"

const AsyncFunction = Object.getPrototypeOf( async function() {} ).constructor;

//open( { protocol: "userDatabaseClient"
//      , server : "ws://localhost:8089/"
//      , servePort : // port this service is serving on.. 
//    } );

const l = {
	events : {},
};

class Socket extends Events {
	ws = null;
	opts = null;
	constructor( url, proto, opts ){
		super();
		this.opts = opts;
		this.ws = sack.WebSocket.Client( url, proto, { perMessageDeflate: false } );
		this.ws.onopen = ()=>this.on("open", this.ws )
		this.ws.onmessage = (msg)=>this.on("message", msg )
		this.ws.onclose = (code,reason)=>this.on("close", [code,reason])
	}
	set onmessage(val) { this.on("message", val ); }
	send( m ) {
		if( "string" ===  typeof m ) this.ws.send( m );
		else this.ws.send( JSOX.stringify( m ) );
	}
}

function open( opts ) {
	const protocol = opts?.protocol || "protocol";
	const server = opts.server;
	console.log( "connect with is:", server, protocol );
	var client = new Socket( server, protocol, { perMessageDeflate: false } );
	client.opts = opts;
	client.on("open", function (ws)  {
		console.log( "Connected (service identification in process; consult config .jsox files)", opts.configPath || "<current PWD>" );
		//console.log( "ws: ", this ); //  ws is also this
		ws.onmessage = ( msg_ )=> {
			const msg = sack.JSOX.parse( msg_ );
			if( msg.op === "addMethod" ) {
				try {
					var f = new AsyncFunction( "Import", "on", "PORT", "opts", "socket", msg.code );
					const p = f.call( ws, (m)=>import(m), UserDbRemote.on, opts.port, opts, client );
					p.then( ()=>{						
						if( opts.connect ) opts.connect( ws );
					} );
				} catch( err ) {
					console.log( "Function compilation error:", err,"\n", msg.code );
				}
			}
			else {
				if( ws.processMessage && !ws.processMessage( msg )  ){
					if( opts.processMessage && !opts.processMessage( ws, msg, msg_ ) )
						console.log( "unknown message Received:", msg );
				}
			}
		};
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

// this is a loopback into self ... 
		const port = Number(process.env.LOGIN_PORT) || Number(process.env.PORT) || Number(process.argv[2])||8600 ;

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
