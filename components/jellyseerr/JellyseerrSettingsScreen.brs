sub init()
    m.serverUrlButton = m.top.findNode("serverUrlButton")
    m.apiKeyButton = m.top.findNode("apiKeyButton")
    m.jellyffinSsoButton = m.top.findNode("jellyffinSsoButton")
    m.localLoginButton = m.top.findNode("localLoginButton")
    m.nsfwToggleButton = m.top.findNode("nsfwToggleButton")
    m.testConnectionButton = m.top.findNode("testConnectionButton")
    m.enableDisableButton = m.top.findNode("enableDisableButton")
    m.backButton = m.top.findNode("backButton")
    m.keyboard = m.top.findNode("keyboard")
    m.statusLabel = m.top.findNode("statusLabel")

    m.apiTask = CreateObject("roSGNode", "JellyseerrAPITask")
    m.currentField = ""
    m.editingServerUrl = false
    m.jellyfinAuthData = invalid

    m.serverUrlButton.observeField("buttonSelected", "onServerUrlPressed")
    m.jellyffinSsoButton.observeField("buttonSelected", "onJellyffinSsoPressed")
    m.localLoginButton.observeField("buttonSelected", "onLocalLoginPressed")
    m.apiKeyButton.observeField("buttonSelected", "onApiKeyPressed")
    m.nsfwToggleButton.observeField("buttonSelected", "onNsfwTogglePressed")
    m.testConnectionButton.observeField("buttonSelected", "onTestConnectionPressed")
    m.enableDisableButton.observeField("buttonSelected", "onEnableDisablePressed")
    m.backButton.observeField("buttonSelected", "onBackPressed")
    m.keyboard.observeField("text", "onKeyboardTextChanged")

    LoadCurrentSettings()
end sub

sub LoadCurrentSettings()
    config = GetJellyseerrConfig()

    if config.serverUrl <> invalid and config.serverUrl <> ""
        m.serverUrlButton.text = Left(config.serverUrl, 40)
    end if

    if config.apiKey <> invalid and config.apiKey <> ""
        m.apiKeyButton.text = "••••••••••••••••" + Right(config.apiKey, 4)
    end if

    ' Set NSFW filter toggle state
    if config.blockNsfw <> invalid and config.blockNsfw = false
        m.nsfwToggleButton.text = "Disabled"
    else
        m.nsfwToggleButton.text = "Enabled"
    end if

    if config.enabled
        m.enableDisableButton.text = "Disable Jellyseerr"
    else
        m.enableDisableButton.text = "Enable Jellyseerr"
    end if
end sub

sub onServerUrlPressed()
    m.currentField = "serverUrl"
    m.editingServerUrl = true
    ShowKeyboard("Enter Jellyseerr Server URL (http://...)")
end sub

sub onJellyffinSsoPressed()
    config = GetJellyseerrConfig()
    if config.serverUrl = invalid or config.serverUrl = ""
        ShowStatus("Please set Server URL first")
        return
    end if

    ' Show password prompt for Jellyfin authentication
    m.currentField = "jellyffinPassword"
    ShowKeyboard("Enter your Jellyfin password")
end sub

sub onLocalLoginPressed()
    config = GetJellyseerrConfig()
    if config.serverUrl = invalid or config.serverUrl = ""
        ShowStatus("Please set Server URL first")
        return
    end if

    ' Show email prompt for local account
    m.currentField = "localEmail"
    ShowKeyboard("Enter your Jellyseerr email")
end sub

sub onApiKeyPressed()
    m.currentField = "apiKey"
    m.editingServerUrl = false
    ShowKeyboard("Enter Jellyseerr API Key")
end sub

sub onNsfwTogglePressed()
    ' Toggle NSFW filtering on/off
    config = GetJellyseerrConfig()

    ' Get current state (default true if not set)
    currentState = true
    if config.blockNsfw <> invalid
        currentState = config.blockNsfw
    end if

    ' Toggle the state
    newState = not currentState

    ' Save the new state
    SetJellyseerrBlockNsfw(newState)

    ' Update button text
    if newState
        m.nsfwToggleButton.text = "Enabled"
        ShowStatus("NSFW content filtering enabled")
    else
        m.nsfwToggleButton.text = "Disabled"
        ShowStatus("NSFW content filtering disabled")
    end if
end sub

sub ShowKeyboard(prompt as string)
    m.statusLabel.text = prompt
    m.statusLabel.visible = true
    m.keyboard.visible = true
    m.keyboard.text = ""
    m.keyboard.setFocus(true)
end sub

sub onKeyboardTextChanged(event as object)
    text = event.getData()

    if text.Len() > 0 and InStr(text, Chr(10)) > 0
        ' Enter pressed
        newlineIdx = InStr(text, Chr(10))
        finalText = Left(text, newlineIdx - 1)

        if m.currentField = "serverUrl"
            if IsValidServerUrl(finalText)
                config = GetJellyseerrConfig()
                SetJellyseerrConfig(finalText, config.apiKey, "")
                m.serverUrlButton.text = Left(finalText, 40)
                m.statusLabel.text = "Server URL updated"
            else
                m.statusLabel.text = "Invalid URL. Must start with http:// or https://"
            end if
        else if m.currentField = "apiKey"
            config = GetJellyseerrConfig()
            SetJellyseerrConfig(config.serverUrl, finalText, "")
            m.apiKeyButton.text = "••••••••••••••••" + Right(finalText, 4)
            m.statusLabel.text = "API Key updated"
        else if m.currentField = "jellyffinPassword"
            ' Jellyfin SSO with password
            PerformJellyffinSSO(finalText)
        else if m.currentField = "localEmail"
            ' Store email and prompt for password
            m.localAuthEmail = finalText
            m.currentField = "localPassword"
            ShowKeyboard("Enter your Jellyseerr password")
            return
        else if m.currentField = "localPassword"
            ' Perform local login
            PerformLocalLogin(m.localAuthEmail, finalText)
        end if

        m.keyboard.visible = false
        m.statusLabel.visible = false
        m.serverUrlButton.setFocus(true)
    end if
end sub

sub PerformJellyffinSSO(password as string)
    ShowStatus("Authenticating with Jellyfin...")

    ' Create login request for Jellyfin SSO
    loginRequest = CreateJellyseerrLoginRequest("jellyfin_user", password, "")

    m.apiTask.request = {
        method: "POST",
        endpoint: "/api/v1/auth/jellyfin",
        body: JellyseerrFormatJson(loginRequest)
    }
    m.apiTask.observeField("response", "onJellyffinSSOResponse")
    m.apiTask.control = "RUN"
end sub

sub onJellyffinSSOResponse(event as object)
    response = event.getData()

    if response.success
        ' Extract API key from response
        apiKey = ExtractApiKeyFromResponse(response.body)
        if apiKey <> ""
            config = GetJellyseerrConfig()
            SetJellyseerrConfig(config.serverUrl, apiKey, "jellyfin")
            m.apiKeyButton.text = "••••••••••••••••" + Right(apiKey, 4)
            ShowStatus(m.global.app.name + " authentication successful! API key generated.")
        else
            ShowStatus("Authentication succeeded but no API key in response")
        end if
    else
        ShowStatus(m.global.app.name + " authentication failed: " + response.error)
    end if
end sub

sub PerformLocalLogin(email as string, password as string)
    ShowStatus("Logging in to Jellyseerr...")

    ' Create local login request
    loginRequest = CreateJellyseerrLocalLoginRequest(email, password)

    m.apiTask.request = {
        method: "POST",
        endpoint: "/api/v1/auth/local",
        body: JellyseerrFormatJson(loginRequest)
    }
    m.apiTask.observeField("response", "onLocalLoginResponse")
    m.apiTask.control = "RUN"
end sub

sub onLocalLoginResponse(event as object)
    response = event.getData()

    if response.success
        ' Extract API key from response
        apiKey = ExtractApiKeyFromResponse(response.body)
        if apiKey <> ""
            config = GetJellyseerrConfig()
            SetJellyseerrConfig(config.serverUrl, apiKey, "local")
            m.apiKeyButton.text = "••••••••••••••••" + Right(apiKey, 4)
            ShowStatus("Local login successful! Permanent API key saved.")
        else
            ShowStatus("Login succeeded but no API key in response")
        end if
    else
        ShowStatus("Local login failed: " + response.error)
    end if
end sub


sub onTestConnectionPressed()
    ShowStatus("Testing connection...")

    config = GetJellyseerrConfig()
    if not IsValidJellyseerrConfig(config)
        ShowStatus("Jellyseerr not configured")
        return
    end if

    m.apiTask.request = {
        method: "GET",
        endpoint: "/api/v1/user"
    }
    m.apiTask.observeField("response", "onConnectionTestResponse")
    m.apiTask.control = "RUN"
end sub

sub onConnectionTestResponse(event as object)
    response = event.getData()

    if response.success
        ShowStatus("Connection successful!")
    else
        ShowStatus("Connection failed: " + response.error)
    end if
end sub

sub onEnableDisablePressed()
    config = GetJellyseerrConfig()

    if config.enabled
        DisableJellyseerr()
        m.enableDisableButton.text = "Enable Jellyseerr"
        ShowStatus("Jellyseerr disabled")
    else
        ShowStatus("Cannot enable without server URL and API Key")
    end if
end sub

sub onBackPressed()
    m.top.getScene().removeChild(m.top)
end sub

sub ShowStatus(message as string)
    m.statusLabel.text = message
    m.statusLabel.visible = true
end sub
