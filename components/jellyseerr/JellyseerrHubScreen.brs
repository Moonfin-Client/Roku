sub init()
    m.discoverButton = m.top.findNode("discoverButton")
    m.searchButton = m.top.findNode("searchButton")
    m.myRequestsButton = m.top.findNode("myRequestsButton")
    m.settingsButton = m.top.findNode("settingsButton")
    m.statusLabel = m.top.findNode("statusLabel")
    m.warningLabel = m.top.findNode("warningLabel")

    m.discoverButton.observeField("buttonSelected", "onDiscoverPressed")
    m.searchButton.observeField("buttonSelected", "onSearchPressed")
    m.myRequestsButton.observeField("buttonSelected", "onMyRequestsPressed")
    m.settingsButton.observeField("buttonSelected", "onSettingsPressed")

    ' Restore and validate session on load
    RestoreSession()

    UpdateStatus()
    m.discoverButton.setFocus(true)
end sub

sub UpdateStatus()
    config = GetJellyseerrConfig()

    if config.enabled
        m.statusLabel.text = "Connected to: " + config.serverUrl
        m.warningLabel.visible = false

        ' Disable warning, enable all buttons
        m.discoverButton.visible = true
        m.searchButton.visible = true
        m.myRequestsButton.visible = true
    else
        m.statusLabel.text = "Not configured"
        m.warningLabel.visible = true

        ' Disable all but settings
        m.discoverButton.visible = false
        m.searchButton.visible = false
        m.myRequestsButton.visible = false
    end if
end sub

sub onDiscoverPressed()
    discoveryScreen = CreateObject("roSGNode", "JellyseerrDiscoveryScreen")
    m.top.getScene().appendChild(discoveryScreen)
    discoveryScreen.setFocus(true)
end sub

sub onSearchPressed()
    searchScreen = CreateObject("roSGNode", "JellyseerrSearchScreen")
    m.top.getScene().appendChild(searchScreen)
    searchScreen.setFocus(true)
end sub

sub onMyRequestsPressed()
    requestsScreen = CreateObject("roSGNode", "JellyseerrMyRequestsScreen")
    m.top.getScene().appendChild(requestsScreen)
    requestsScreen.setFocus(true)
end sub

sub onSettingsPressed()
    settingsScreen = CreateObject("roSGNode", "JellyseerrSettingsScreen")
    m.top.getScene().appendChild(settingsScreen)
    settingsScreen.setFocus(true)
end sub

sub RestoreSession()
    ' Validate stored session cookie on app launch

    config = GetJellyseerrConfig()

    ' Only validate if using cookie authentication
    if not isValidStringValue(config.authCookie)
        return
    end if

    ' Check if we've already validated this session
    if m.global <> invalid and m.global.jellyseerrSessionValidated = true
        return
    end if

    ' Validate the cookie
    isValid = ValidateJellyseerrCookie()

    if isValid
        m.statusLabel.text = "Connected to: " + config.serverUrl + " (Session Active)"

        ' Mark as validated for this app session
        if m.global <> invalid
            m.global.addFields({ jellyseerrSessionValidated: true })
        end if
    else
        m.statusLabel.text = "Session Expired - Please re-authenticate in Settings"
        m.warningLabel.text = "Your session has expired. Go to Settings to log in again."
        m.warningLabel.visible = true

        ' Disable feature buttons since session is invalid
        m.discoverButton.visible = false
        m.searchButton.visible = false
        m.myRequestsButton.visible = false
    end if
end sub
