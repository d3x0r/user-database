
export const config = (await 
		import( ((process.platform=="win32")?"file://":"")+process.cwd()+"/config-login-service.jsox" ).catch(err=>{ 
			return import( ((process.platform=="win32")?"file://":"")+process.cwd()+"/config.jsox" ).catch(err=>{ 
				return {default:{dsn:"maria-udb"}
						, certPath:"."
						, allowGuestServices: false
				}
		})
})).default;
