sub init()
    m.profileImage = m.top.findNode("profileImage")
    m.photoCircle = m.top.findNode("photoCircle")
    m.actorName = m.top.findNode("actorName")
    m.characterName = m.top.findNode("characterName")
end sub

sub itemContentChanged(event as object)
    content = event.getData()
    if content = invalid then return

    ' Set actor name
    if content.title <> invalid
        m.actorName.text = content.title
    end if

    ' Set character name with "as " prefix
    if content.description <> invalid
        m.characterName.text = "as " + content.description
    end if

    ' Set profile image
    if content.hdPosterUrl <> invalid
        m.profileImage.uri = content.hdPosterUrl
    end if
end sub

sub focusChanged(event as object)
    hasFocus = event.getData()

    if hasFocus
        m.profileImage.opacity = 1.0
        m.actorName.color = "#FFFFFF"
        m.characterName.color = "#FFFFFF"
    else
        m.profileImage.opacity = 1.0
        m.actorName.color = "#CCCCCC"
        m.characterName.color = "#999999"
    end if
end sub
