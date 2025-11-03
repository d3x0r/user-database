
import DNS from 'dns';




export function checkEmail( email ) {
	return new Promise( (res,rej)=>{
		validateEmail( email, ( valid )=> {
			if( !valid ) res( false );
			else res( UserDb.isEmailUsed( email ) );
		} );
	});
}

const domainAllowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"
const allowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&'*+-/=?^_`{|}~"
const allowedChars2 = ' .(),:;<>@[]' ; // \ and " can be quoted too; but handled separtely

// this needs to handle just IP addresses also.

function validateEmail( email, cb ) {
	if( !email ) return cb( false );
	function lookupDomain( domain, cb ) {
		DNS.lookup( domain, (err,address,family)=>{
			_debug_email && console.log( "test domain:",domain, err);
			if( err ) cb( false );
			else cb( true );
		})
	}

	function stripComment( field ) {
		if( field[0] == '(' ) {
			for( var n = 1; n < field.length; n++ )
				if( field[n] == ')' ) {
					return field.substr( n+1 );
				}
			return '';
		}

		if( field[field.length-1] == ')' ) {
			for( var n = field.length-1; n >= 0; n-- )
				if( field[n] == '(' ) {
					return field.substr( 0, n );
				}
			return '';
		}
	return field;
	}

	function quotedAtSplit( email ) {
		var parts = [];
		var quoted = false;
		var escape = false;
		for( var n = 0; n < email.length; n++ ) {
			if( email[n] == '"' ) {
				if( escape ) { escape = false; continue; }
				if( quoted ) { quoted = false; continue; } else { quoted = true; continue; }
			}
			if( email[n] == '\\' )
				if( escape ) { escape = false; continue }
				else if( quoted ) { escape = true; continue; }
			if( escape ) { escape = false; continue; };
			if( email[n] == '@' ) {
				if( quoted ) continue;
				parts.push( email.substr( 0, n ) );
				parts.push( email.substr( n+1 ) );
				return parts;
			}
		}
		return parts;
    }

	function quotedDotSplit( email ) {
		var parts = [];
		var lastPart = 0;
		var quoted = false;
		var escape = false;
		for( var n = 0; n < email.length; n++ ) {
			if( email[n] == '"' ) {
				if( escape ) { escape = false; continue; }
				if( quoted ) { quoted = false; continue; } else { quoted = true; continue; }
			}
			if( email[n] == '\\' )
				if( escape ) { escape = false; continue }
				else if( quoted ) { escape = true; continue; }
			if( escape ) { escape = false; continue; };
			if( email[n] == '.' ) {
				_debug_email&&console.log( "found a dot...", quoted, parts );
				if( quoted ) continue;
				parts.push( email.substr( lastPart, n-lastPart ) );
				lastPart = n+1;
			}
		}
		_debug_email&&console.log( "Tail:", lastPart, email, "=", email.substr( lastPart ) );
		parts.push( email.substr( lastPart ) );
		return parts;
	}
	var parts = quotedAtSplit( email );
	_debug_email&&console.log( "Split:", parts );
	if( parts.length != 2 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	if( parts[0].length > 64 || parts[0].length < 1 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	parts[0] = stripComment( parts[0] );
	if( !parts[0] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	parts[1] = stripComment( parts[1] );
	if( !parts[1] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	_debug_email&&console.log( "domain comment-stripped:", parts[1] );

	var local = quotedDotSplit( parts[0] );
	_debug_email&&console.log( "local dot split:", local );
	for( n = 0; n < local.length; n++ ) {
		local[n] = [...local[n]];
	}
	if( parts[1].length > 253 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	var domain = parts[1].split( "." );
	if( domain.length > 127 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
	var n;
	for( n = 0; n < local.length; n++ ) {
		if( !local[n].length ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		var len = local[n].length;
		var escape = false;
		if( local[n][0] == '"' ) {
			if( local[n][local[n].length-1] !== '"' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			len--;
			for( var m = 1; m < len; m++ ) {
				if( local[n][m].codePointAt(0) > 0x7f ) continue;
				if( local[n][m] == "\\" )
					if( escape ) {
						escape = false;
						continue;
					}
					else {
						escape = true;
						continue;
					}
				if( escape ) {
					if( local[n][m] == '"' ) {
						escape = false;
						continue;
					}
				}
				if( !allowedChars.includes( local[n][m] ) )
					if( !allowedChars2.includes( local[n][m] ) )
						{ _debug_email&&console.log( "Fail at char:", m, local[n], local[n][m] ); _debug_email&&console.trace( "FAIL" ); return false; }
			}
		}
		else {
			for( var m = 0; m < len; m++ ) {
				if( local[n][m].codePointAt(0) > 0x7f ) continue;
				if( !allowedChars.includes( local[n][m] ) )
					{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			}
		}
	}

	if( parts[1][0] == '[' && parts[1][parts[1].length-1] == ']' ) {
		parts[1] = parts[1].substr( 1, parts[1].length-2 );
		if( parts[1].startsWith( "IPv6:" ) ) {
			var addrparts = parts[1].split(':' );
			var words = [];
			var zero = 0;
			for( var n = 1; n < addrparts.length; n++ ) {
				if( !addrparts[n].length ) {
					if( zero ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // already found a zero filler
					zero = n;
					words.push( 0 );
				} else {
					var val = parseInt(addrparts[n], 16);
					if( val.toString(16).toUpperCase() !== addrparts[n].toUpperCase() )
						{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
					words.push( val );
				}
			}
			function zeroFill( words ) {
				var newwords = [];
				for( var n = 0; n < zero-1; n++ )
					newwords.push( words[n] );

				for( var m = 0; m < 8-( (words.length-1) ); m++ )
					newwords.push(0);
				n++;
				for( ; n < words.length; n++ )
					newwords.push( words[n] );
				return newwords;
			}
			_debug_email&&console.log( "words:", words );
			words = zeroFill( words );
			_debug_email&&console.log( "words:", words );
			if( words.length !== 8 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( !words[0] ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] > 0xFF00 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to mutlicast email
			if( words[0] == 0xfec0 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to site local
			if( words[0] == 0x0100 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to trash
			if( ( words[0] & 0xFF30 ) == 0xfe80 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to site local
			if( ( words[0] & 0xFC00 ) == 0xfc00 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // unique local
			if( words[0] == 0x2001 && words[1] == 0xdb8 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; } // cannot send to example IP

		}
		else {
			var addrparts = parts[1].split('.');
			var words = [];
			if( addrparts.length != 4 )
				{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			for( var n = 0; n < addrparts.length; n++ ) {
				var val = parseInt( addrparts[n] );
				if( val.toString() !== addrparts[n] )
					{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
				if( val > 255 || val < 0 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
				words.push( val );
			}
			// disallow localhost addresses
			if( words[0] == 192 && words[1] == 168 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 172 && words[1] >= 16 && words[1] < 32 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 10 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
			if( words[0] == 127 && words[1] == 0 && words[2] == 0 && words[3] == 1 ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }

		}
		return true;  // assume the IP in brackets is valid?
	}
	for( n = 0; n < domain.length; n++ ) {
		_debug_email&&console.log( "domain part:", domain[n] );

		if( domain[n].length < 1 || domain[n].length > 63 ) {
			if( n == (domain.length-1) && domain[n].length === 0 )
				continue;
			{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		}
		if( domain[n][0] == '-' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		if( domain[n][domain[n].length-1] == '-' ) { _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		var len = domain[n].length;

 		for( var m = 0; m < len; m++ ) {
			if( !domainAllowedChars.includes( domain[n][m] ) )
				{ _debug_email&&console.trace( "FAIL" ); cb(false);return false; }
		}
	}
	lookupDomain( domain.join('.'), cb );
/*
Uppercase and lowercase English letters (a-z, A-Z)
Digits 0 to 9
Characters ! # $ % & ' * + - / = ? ^ _ ` { | }
Character . (dot, period, full stop) provided that it is not the first or last character,
		and provided also that it does not appear two or more times consecutively.
*/
}
