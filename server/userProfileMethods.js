
const ws = this;
//console.log("Extend this websocket:", this);

const SaltyRNGModule = await Import("@d3x0r/srg2");
const SaltyRNG = SaltyRNGModule.SaltyRNG;
//ws.SaltyRNG = SaltyRNG;

if(true) {
	const clientKey = localStorage.getItem("sack/udb/clientId");
	if (!clientKey) {
		// this is ignored if server doesn't track unique devices
		ws.send(`{op:newClient}`);
	}
}

const l = {
	pending: [],
	wasGuest : false,
}

ws.changeName = function ( name ) {
	return new Promise( (res,rej)=>{
		const p = {res,rej,msg:{op:"changeName", id:SaltyRNG.Id(), changeName: { name: name } } };
		l.pending.push( p );
		ws.send(JSON.stringify( p.msg ) );
	} );
}


ws.processMessage = function (ws, msg) {
	//console.log("socket gets a turn?", msg);
	if( msg.op === "config"){
		
	} else if( msg.op === "changeName"){
		let pend = null;
		for( let p = 0; p < l.pending.length; p++ ) {
			pend = l.pending[p];
			if( l.pending[p].msg.id === msg.id ) {
				l.pending.splice(p,1);
				break;
			}
		}
		if( !pend ) {
			console.log( "Failed to find pending for :", msg );
			return;
		}
		if (msg.success) {
			pend.res();
		} else 
			pend.rej();
		return true;
	} else {
		console.log( "Server sent unhandled message:", msg );
	}

}
