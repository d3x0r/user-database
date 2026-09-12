
import { SaltyRNG } from "/node_modules/@d3x0r/srg2/salty_random_generator2.mjs"
import { popups } from "/node_modules/@d3x0r/popups2/popups.js"
import { profileState } from "./profile.js"

// Drives profileForm.html.  All traffic goes through profileState (profile.js), which
// owns the profile socket; this only renders the summary and sends operations.
// Passwords and emails are hashed with SaltyRNG.id() before they leave the browser,
// exactly as the login and create forms do, so the server only ever compares hashes.
export class ProfileContent {
	#root = null;
	#el = {};
	#onProfile = null;
	#onDisconnect = null;
	#assigning = {}; // "service@domain" -> display name currently open in the assignment view
	#emailOpen = false; // the change-email form is collapsed behind the Change button

	constructor( rootNode ) {
		this.#root = rootNode;
		const q = ( id )=>rootNode.querySelector( "#" + id );
		this.#el = {
			displayName: q( "displayName" ), saveName: q( "saveName" )
			, account: q( "account" ), created: q( "created" ), emailState: q( "emailState" )
			, sashes: q( "sashes" )
			, manage: q( "manage" )
			, passwordSection: q( "passwordSection" )
			, currentPassword: q( "currentPassword" ), newPassword: q( "newPassword" ), newPassword2: q( "newPassword2" ), savePassword: q( "savePassword" )
			, emailSection: q( "emailSection" ), toggleEmail: q( "toggleEmail" )
			, newEmail: q( "newEmail" ), emailPassword: q( "emailPassword" ), saveEmail: q( "saveEmail" )
			, status: q( "status" ), logout: q( "logout" )
		};

		popups.handleButtonEvents( this.#el.saveName, ()=>this.saveName() );
		popups.handleButtonEvents( this.#el.savePassword, ()=>this.savePassword() );
		popups.handleButtonEvents( this.#el.saveEmail, ()=>this.saveEmail() );
		popups.handleButtonEvents( this.#el.toggleEmail, ()=>{
			this.#emailOpen = !this.#emailOpen;
			this.#el.emailSection.style.display = this.#emailOpen ? "" : "none";
			if( this.#emailOpen ) this.#el.newEmail.focus();
		} );
		popups.handleButtonEvents( this.#el.logout, ()=>profileState.logout() );
		this.#el.displayName.addEventListener( "keydown", ( evt )=>{ if( evt.key === "Enter" ) this.saveName(); } );
		this.#el.newPassword2.addEventListener( "keydown", ( evt )=>{ if( evt.key === "Enter" ) this.savePassword(); } );
		this.#el.emailPassword.addEventListener( "keydown", ( evt )=>{ if( evt.key === "Enter" ) this.saveEmail(); } );

		this.#onProfile = profileState.on( "profile", ( data )=>this.render( data ) );
		this.#onDisconnect = profileState.on( "disconnect", ()=>this.status( "Disconnected from the profile service.", true ) );
		if( profileState.data ) this.render( profileState.data );
		else this.status( "Loading profile..." );
	}

	status( text, isError ) {
		const s = this.#el.status;
		s.textContent = text || "";
		s.className = "profile-status" + ( text ? ( isError ? " error" : " ok" ) : "" );
	}

	// run an operation, report its outcome, and re-read the profile on success
	async run( msg, okText ) {
		try {
			const r = await profileState.request( msg );
			this.status( "function" === typeof okText ? okText( r ) : okText );
			profileState.refresh();
			return r;
		} catch( err ) { this.status( err.message, true ); return null; }
	}

	render( data ) {
		const el = this.#el;
		if( el.status.textContent === "Loading profile..." ) this.status( "" );
		el.displayName.value = data.name || "";
		el.account.textContent = data.guest ? "(guest)" : ( data.account || "" );
		el.created.textContent = data.created ? new Date( data.created ).toLocaleString() : "";
		el.emailState.textContent = data.guest ? "none" : ( data.hasEmail ? "on file" : "none on file" );
		el.toggleEmail.querySelector( ".buttonInner" ).textContent = data.hasEmail ? "Change" : "Add";

		el.sashes.textContent = "";
		if( !data.sashes || !data.sashes.length ) {
			const li = document.createElement( "li" );
			li.textContent = "(no sashes yet)";
			el.sashes.appendChild( li );
		} else for( const sash of data.sashes ) {
			const li = document.createElement( "li" );
			const name = document.createElement( "span" );
			name.textContent = sash.name;
			if( sash.master ) name.className = "sash-master";
			li.appendChild( name );
			const badges = document.createElement( "div" );
			badges.className = "sash-badges";
			badges.textContent = sash.badges.length
				? "badges: " + sash.badges.map( badgeLabel ).join( ", " )
				: ( sash.master ? "master sash (all badges)" : "no badges" );
			li.appendChild( badges );
			el.sashes.appendChild( li );
		}

		// one management block per service, however many of its sashes grant management
		const managed = [], seenService = new Set();
		for( const s of ( data.sashes || [] ) ) {
			if( !s.manage || !s.service ) continue;
			const key = s.service.name + "@" + s.service.domain;
			if( seenService.has( key ) ) continue;
			seenService.add( key );
			managed.push( s );
		}
		this.renderManagement( managed );

		// guests and remote identities can look but not change anything
		const editable = data.editable && !data.guest;
		el.displayName.disabled = !editable;
		el.saveName.style.display = editable ? "" : "none";
		el.passwordSection.style.display = editable ? "" : "none";
		el.emailSection.style.display = ( editable && this.#emailOpen ) ? "" : "none";
		el.toggleEmail.style.display = editable ? "" : "none";
		// a refresh after a successful change re-renders; leave that result message alone
		if( !data.editable ) this.status( data.error || "This profile is read-only here; edit it on the login server that holds the account." );
		else if( data.guest ) this.status( "Guest login: create an account to keep a profile." );
	}

	// One block per service this account manages: the badges the service defines, every
	// sash with a checkbox per badge, a row to create a sash, and a row to hand a sash
	// to another account.  Rebuilt on every summary, so it always reflects the server.
	renderManagement( managed ) {
		const box = this.#el.manage;
		box.textContent = "";
		box.style.display = managed.length ? "" : "none";
		for( const entry of managed ) {
			const svc = entry.service;
			const section = document.createElement( "div" );
			section.className = "profile-section manage-service";
			const h = document.createElement( "div" );
			h.className = "profile-label manage-title";
			h.textContent = "Sashes for " + svc.name + "@" + svc.domain;
			section.appendChild( h );

			const badges = entry.serviceBadges || [];
			if( !badges.length ) {
				const none = document.createElement( "div" );
				none.className = "sash-badges";
				none.textContent = "This service defines no badges yet (service.badges.jsox).";
				section.appendChild( none );
			}

			const table = document.createElement( "table" );
			table.className = "sash-table";
			const head = table.insertRow();
			head.insertCell().textContent = "sash";
			for( const b of badges ) {
				const c = head.insertCell();
				c.textContent = b.tag;
				c.title = ( b.name || "" ) + ( b.description ? " - " + b.description : "" );
			}
			head.insertCell().textContent = "";
			for( const sash of ( entry.serviceSashes || [] ) ) {
				const row = table.insertRow();
				const nameCell = row.insertCell();
				nameCell.textContent = sash.name + ( sash.master ? " (master)" : sash.isDefault ? " (default)" : "" );
				const boxes = [];
				for( const b of badges ) {
					const c = row.insertCell();
					const cb = document.createElement( "input" );
					cb.type = "checkbox";
					cb.checked = sash.master || sash.badges.includes( b.tag );
					cb.disabled = !!sash.master;
					cb.dataset.tag = b.tag;
					c.appendChild( cb );
					boxes.push( cb );
				}
				const act = row.insertCell();
				if( !sash.master && badges.length ) {
					const save = button( "Save", ()=>this.run( { op:"setSashBadges", domain:svc.domain, service:svc.name, sash:sash.name
						, badges: boxes.filter( ( cb )=>cb.checked ).map( ( cb )=>cb.dataset.tag ) }
						, "Badges saved for " + sash.name + "." ) );
					act.appendChild( save );
				}
			}
			section.appendChild( table );

			// create
			const createRow = document.createElement( "div" );
			createRow.className = "profile-row";
			const newName = document.createElement( "input" );
			newName.className = "loginUsername";
			newName.placeholder = "new sash name";
			createRow.appendChild( newName );
			createRow.appendChild( button( "Create Sash", ()=>{
				const name = newName.value.trim();
				if( name.length < 2 ) return this.status( "Give the new sash a name.", true );
				this.run( { op:"createSash", domain:svc.domain, service:svc.name, name }, ( r )=>"Created sash " + r.name + "." ).then( ( r )=>{ if( r ) newName.value = ""; } );
			} ) );
			newName.addEventListener( "keydown", ( evt )=>{ if( evt.key === "Enter" ) createRow.lastChild.click(); } );
			section.appendChild( createRow );

			// assign: look one user up, then move this service's sashes on or off them
			const lookupRow = document.createElement( "div" );
			lookupRow.className = "profile-row";
			const who = document.createElement( "input" );
			who.className = "loginUsername";
			who.placeholder = "display name to manage";
			lookupRow.appendChild( who );
			const assignBox = document.createElement( "div" );
			assignBox.className = "assign-box";
			const load = ()=>{
				const account = who.value.trim();
				if( !account ) return this.status( "Enter the display name of the user to manage.", true );
				this.loadAssignment( assignBox, svc, entry.serviceSashes || [], account );
			};
			who.addEventListener( "keydown", ( evt )=>{ if( evt.key === "Enter" ) load(); } );
			lookupRow.appendChild( button( "Load User", load ) );
			section.appendChild( lookupRow );
			section.appendChild( assignBox );
			// every summary rebuilds this block; keep the user that was being managed open
			const remembered = this.#assigning[svc.name + "@" + svc.domain];
			if( remembered ) { who.value = remembered; load(); }

			box.appendChild( section );
		}

		function button( text, cb ) {
			const b = document.createElement( "button" );
			b.className = "button";
			const inner = document.createElement( "span" );
			inner.className = "buttonInner";
			inner.textContent = text;
			b.appendChild( inner );
			popups.handleButtonEvents( b, cb );
			return b;
		}
	}

	// Two lists for one user: the service's sashes they wear, and the ones they don't,
	// with buttons to move a selected sash across.  Each move is one server operation
	// and the lists are re-read afterwards, so they always show the server's state.
	async loadAssignment( box, svc, serviceSashes, account ) {
		box.textContent = "loading " + account + "...";
		let r;
		try {
			r = await profileState.request( { op:"getUserSashes", domain:svc.domain, service:svc.name, account } );
		} catch( err ) { box.textContent = ""; return this.status( err.message, true ); }
		box.textContent = "";
		this.#assigning[svc.name + "@" + svc.domain] = r.name;
		const title = document.createElement( "div" );
		title.className = "profile-label";
		title.textContent = r.name + ( r.guest ? " (guest)" : "" ) + " wears:";
		box.appendChild( title );

		const worn = new Set( r.sashes );
		const has = serviceSashes.filter( s=>worn.has( s.name ) );
		const not = serviceSashes.filter( s=>!worn.has( s.name ) );
		const list = ( items, emptyText )=>{
			const sel = document.createElement( "select" );
			sel.size = Math.max( 3, Math.min( 8, items.length ) );
			sel.className = "assign-list";
			for( const s of items ) {
				const opt = document.createElement( "option" );
				opt.value = s.name;
				opt.textContent = s.name + ( s.master ? " (master)" : s.isDefault ? " (default)" : "" );
				sel.appendChild( opt );
			}
			if( !items.length ) {
				const opt = document.createElement( "option" );
				opt.disabled = true;
				opt.textContent = emptyText;
				sel.appendChild( opt );
			}
			return sel;
		};
		const hasList = list( has, "(none)" );
		const notList = list( not, "(all assigned)" );
		// run() refreshes the profile on success; that rebuilds the management block and
		// re-opens this user (see #assigning), so the lists come back from the server.
		const move = ( from, op, verb )=>{
			const sashName = from.value;
			if( !sashName ) return this.status( "Select a sash to " + verb + ".", true );
			this.run( { op, domain:svc.domain, service:svc.name, sash:sashName, account:r.name }
				, ( rr )=>sashName + ( op === "grantSash" ? ( rr.already ? " was already on " : " given to " ) : ( rr.removed ? " taken from " : " was not on " ) ) + rr.name + "." );
		};
		const arrows = document.createElement( "div" );
		arrows.className = "assign-arrows";
		arrows.appendChild( makeButton( "◀ give", ()=>move( notList, "grantSash", "give" ) ) );
		arrows.appendChild( makeButton( "take ▶", ()=>move( hasList, "revokeSash", "take" ) ) );
		const row = document.createElement( "div" );
		row.className = "assign-row";
		const col = ( label, sel )=>{
			const c = document.createElement( "div" );
			const l = document.createElement( "div" );
			l.className = "sash-badges";
			l.textContent = label;
			c.appendChild( l );
			c.appendChild( sel );
			return c;
		};
		row.appendChild( col( "wearing", hasList ) );
		row.appendChild( arrows );
		row.appendChild( col( "available", notList ) );
		box.appendChild( row );
		hasList.addEventListener( "dblclick", ()=>move( hasList, "revokeSash", "take" ) );
		notList.addEventListener( "dblclick", ()=>move( notList, "grantSash", "give" ) );
	}

	async saveName() {
		const name = this.#el.displayName.value.trim();
		if( name.length < 3 ) return this.status( "Display name must be at least 3 characters.", true );
		await this.run( { op:"setName", name }, ( r )=>"Display name saved as " + r.name + "." );
	}

	async savePassword() {
		const el = this.#el;
		if( !el.currentPassword.value ) return this.status( "Enter your current password.", true );
		if( !el.newPassword.value ) return this.status( "Enter a new password.", true );
		if( el.newPassword.value !== el.newPassword2.value ) return this.status( "New passwords do not match.", true );
		try {
			await profileState.request( { op:"setPassword"
				, current: SaltyRNG.id( el.currentPassword.value )
				, password: SaltyRNG.id( el.newPassword.value ) } );
			el.currentPassword.value = el.newPassword.value = el.newPassword2.value = "";
			this.status( "Password changed." );
		} catch( err ) { this.status( err.message, true ); }
	}

	async saveEmail() {
		const el = this.#el;
		if( !el.newEmail.value ) return this.status( "Enter an email address.", true );
		if( !el.emailPassword.value ) return this.status( "Enter your password to change the email.", true );
		const r = await this.run( { op:"setEmail"
			, email: SaltyRNG.id( el.newEmail.value )
			, current: SaltyRNG.id( el.emailPassword.value ) }, "Recovery email updated." );
		if( r ) {
			el.newEmail.value = el.emailPassword.value = "";
			this.#emailOpen = false; // done; the row's Change button reopens it
		}
	}
}

function makeButton( text, cb ) {
	const b = document.createElement( "button" );
	b.className = "button";
	const inner = document.createElement( "span" );
	inner.className = "buttonInner";
	inner.textContent = text;
	b.appendChild( inner );
	popups.handleButtonEvents( b, cb );
	return b;
}

function badgeLabel( b ) {
	return ( b.name && b.name !== b.tag ) ? b.name + " [" + b.tag + "]" : b.tag;
}
