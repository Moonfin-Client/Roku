sub init()
    m.top.functionName = "executeAuth"
end sub

sub executeAuth()
    serverUrl = m.top.serverUrl
    authEndpoint = m.top.authEndpoint
    authBody = m.top.authBody

    if serverUrl = invalid or serverUrl = ""
        m.top.response = {
            success: false,
            error: "Invalid server URL",
            statusCode: 400
        }
        return
    end if

    if authEndpoint = invalid or authEndpoint = ""
        m.top.response = {
            success: false,
            error: "Invalid auth endpoint",
            statusCode: 400
        }
        return
    end if

    ' Build URL
    url = serverUrl
    if Right(url, 1) = "/" then url = Left(url, Len(url) - 1)
    if Left(authEndpoint, 1) <> "/" then authEndpoint = "/" + authEndpoint
    url = url + authEndpoint


    ' Create HTTP request
    urlTransfer = CreateObject("roUrlTransfer")
    urlTransfer.SetUrl(url)
    urlTransfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    urlTransfer.InitClientCertificates()

    ' Create message port for async request
    port = CreateObject("roMessagePort")
    urlTransfer.SetMessagePort(port)

    ' Set headers (no API key needed for auth)
    urlTransfer.AddHeader("Content-Type", "application/json")
    urlTransfer.AddHeader("User-Agent", "Moonfin/1.0")

    ' Execute async POST request
    urlTransfer.AsyncPostFromString(authBody)

    ' Wait for response
    event = wait(30000, port)

    statusCode = 0
    response = ""

    if type(event) = "roUrlEvent"
        statusCode = event.GetResponseCode()
        response = event.GetString()
    else
        ' Timeout or error
        m.top.response = {
            success: false,
            error: "Request timeout or network error",
            statusCode: 0,
            rawResponse: ""
        }
        return
    end if


    ' Extract cookies from response headers
    ' Jellyseerr uses connect.sid as the primary session cookie
    cookies = ""
    responseHeaders = event.GetResponseHeaders()
    if responseHeaders <> invalid
        ' Look for Set-Cookie headers and filter for session cookies
        for each header in responseHeaders
            headerName = LCase(header)
            if headerName = "set-cookie"
                cookieValue = responseHeaders[header]

                ' Extract cookie name=value part (before first semicolon)
                semicolonPos = InStr(cookieValue, ";")
                cookiePair = ""
                if semicolonPos > 0
                    cookiePair = Left(cookieValue, semicolonPos - 1)
                else
                    cookiePair = cookieValue
                end if

                ' Filter for relevant session cookies (connect.sid is the main one)
                ' Also accept other common session cookie names
                cookieName = ""
                equalsPos = InStr(cookiePair, "=")
                if equalsPos > 0
                    cookieName = LCase(Left(cookiePair, equalsPos - 1))
                end if

                ' Only include session-related cookies
                if cookieName = "connect.sid" or cookieName = "sessionid" or cookieName = "session" or cookieName = "jellyseerr.sid"
                    if cookies <> "" then cookies = cookies + "; "
                    cookies = cookies + cookiePair
                else
                end if
            end if
        end for
    end if


    ' Parse response
    if response <> invalid and response <> "" and statusCode >= 200 and statusCode < 300
        m.top.response = {
            success: true,
            statusCode: statusCode,
            rawResponse: response,
            cookies: cookies
        }
    else
        errorMsg = "Authentication failed"
        if response <> invalid and response <> ""
            errorMsg = errorMsg + " - Response: " + response
        end if
        m.top.response = {
            success: false,
            error: errorMsg,
            statusCode: statusCode,
            rawResponse: response
        }
    end if
end sub
