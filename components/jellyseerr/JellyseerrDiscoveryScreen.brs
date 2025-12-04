sub init()
    m.categoryRows = m.top.findNode("categoryRows")
    m.loadingLabel = m.top.findNode("loadingLabel")
    m.errorLabel = m.top.findNode("errorLabel")
    m.detailsSection = m.top.findNode("detailsSection")
    m.itemTitle = m.top.findNode("itemTitle")
    m.itemOverview = m.top.findNode("itemOverview")
    m.metadataText = m.top.findNode("metadataText")
    m.backdrop = m.top.findNode("backdrop")
    m.backdropTint = m.top.findNode("backdropTint")

    m.categoryData = []
    m.rowsLoading = {}
    m.apiTasks = {}
    m.categoryRows.visible = true
    m.categoryRows.itemSize = [1703, 330]
    m.categoryRows.itemSpacing = [0, 150]
    m.categoryRows.rowItemSpacing = [20, 0]
    m.categoryRows.rowItemSize = [180, 270]
    m.categoryRows.drawFocusFeedback = true
    m.categoryRows.focusBitmapBlendColor = "#666666"
    m.categoryRows.rowLabelOffset = [[0, 15]]

    m.categoryRows.observeField("rowItemFocused", "onRowItemFocused")
    m.categoryRows.observeField("rowItemSelected", "onRowItemSelected")

    LoadDiscoveryCategories()
end sub

sub LoadDiscoveryCategories()
    ShowLoading()

    categories = [
        {
            name: "Trending",
            endpoint: "/api/v1/discover/trending",
            queryParams: { page: "1", language: "en" },
            mediaType: "all"
        },
        {
            name: "Popular Movies",
            endpoint: "/api/v1/discover/movies",
            queryParams: { page: "1", language: "en" },
            mediaType: "movie"
        },
        {
            name: "Popular TV Series",
            endpoint: "/api/v1/discover/tv",
            queryParams: { page: "1", language: "en" },
            mediaType: "tv"
        },
        {
            name: "Upcoming Movies",
            endpoint: "/api/v1/discover/movies/upcoming",
            queryParams: { language: "en" },
            mediaType: "movie"
        },
        {
            name: "Upcoming TV Series",
            endpoint: "/api/v1/discover/tv/upcoming",
            queryParams: { language: "en" },
            mediaType: "tv"
        },
        {
            name: "Your Requests",
            endpoint: "/api/v1/request",
            queryParams: { take: "50", skip: "0", sort: "modified", filter: "all" },
            mediaType: "requests",
            isRequestsRow: true
        }
    ]

    m.categoryData = categories
    contentNode = CreateObject("roSGNode", "ContentNode")

    for i = 0 to categories.Count() - 1
        category = categories[i]

        rowNode = CreateObject("roSGNode", "ContentNode")
        rowNode.title = category.name
        rowNode.addFields({
            endpoint: category.endpoint,
            queryParams: category.queryParams,
            mediaType: category.mediaType,
            isRequestsRow: category.isRequestsRow = true
        })
        contentNode.appendChild(rowNode)
    end for

    m.categoryRows.content = contentNode

    m.pendingRowsToLoad = categories.Count()
    for i = 0 to categories.Count() - 1
        LoadRowContent(i)
    end for
end sub

sub LoadRowContent(rowIndex as integer)
    if rowIndex < 0 or rowIndex >= m.categoryRows.content.getChildCount()
        return
    end if

    row = m.categoryRows.content.getChild(rowIndex)

    if row.getChildCount() > 0
        HideLoading()
        return
    end if

    rowKey = "row_" + rowIndex.toStr()
    if m.rowsLoading[rowKey] = true
        return
    end if

    m.rowsLoading[rowKey] = true

    config = GetJellyseerrConfig()

    if not IsValidJellyseerrConfig(config)
        ShowError("Jellyseerr not configured")
        return
    end if

    endpoint = row.endpoint

    if Left(endpoint, 4) <> "/api"
        endpoint = "/api/v1" + endpoint
    end if

    apiTask = CreateObject("roSGNode", "JellyseerrAPITask")
    apiTask.addFields({ rowIndex: rowIndex })
    m.apiTasks[rowKey] = apiTask

    apiTask.request = {
        method: "GET",
        endpoint: endpoint,
        queryParams: row.queryParams
    }

    apiTask.observeField("response", "onDiscoveryResponse")
    apiTask.control = "RUN"
end sub

sub onRowItemFocused(event as object)
    focusedIndex = event.getData()

    if focusedIndex.count() > 0
        rowIndex = focusedIndex[0]

        ' Only load row content if it hasn't been loaded yet
        row = m.categoryRows.content.getChild(rowIndex)
        if row <> invalid and row.getChildCount() = 0
            LoadRowContent(rowIndex)
        end if

        if focusedIndex.count() > 1
            itemIndex = focusedIndex[1]

            if row <> invalid and itemIndex < row.getChildCount()
                focusedItem = row.getChild(itemIndex)
                UpdateDetailsSection(focusedItem)
            end if
        end if
    end if
end sub

sub UpdateDetailsSection(item as object)
    if item = invalid then return

    m.itemTitle.text = item.title
    metaParts = []
    if item.releaseYear <> invalid and item.releaseYear <> ""
        metaParts.push(item.releaseYear)
    end if
    if item.mediaType <> invalid and item.mediaType <> ""
        mediaTypeLabel = item.mediaType
        if item.mediaType = "movie" then mediaTypeLabel = "Movie"
        if item.mediaType = "tv" then mediaTypeLabel = "TV Series"
        metaParts.push(mediaTypeLabel)
    end if
    if item.rating <> invalid and item.rating <> ""
        metaParts.push("★ " + item.rating)
    end if

    m.metadataText.text = metaParts.join(" • ")

    if item.overview <> invalid and item.overview <> ""
        m.itemOverview.text = item.overview
    else
        m.itemOverview.text = ""
    end if

    if item.backdropUrl <> invalid and item.backdropUrl <> ""
        m.backdrop.uri = item.backdropUrl
    end if
end sub

sub onRowItemSelected(event as object)
    selectedIndex = event.getData()
    if selectedIndex.count() > 0
        itemIndex = selectedIndex[1]
        rowIndex = selectedIndex[0]
        row = m.categoryRows.content.getChild(rowIndex)
        selectedItem = row.getChild(itemIndex)

        if selectedItem <> invalid
            ShowMediaDetails(selectedItem)
        end if
    end if
end sub

sub onDiscoveryResponse(event as object)
    response = event.getData()
    apiTask = event.getRoSGNode()
    rowIndex = apiTask.rowIndex

    row = m.categoryRows.content.getChild(rowIndex)
    if row.getChildCount() > 0
        return
    end if

    rowKey = "row_" + rowIndex.toStr()
    m.rowsLoading.delete(rowKey)
    m.apiTasks.delete(rowKey)

    if m.rowsLoading.count() = 0
        HideLoading()
    end if

    if response.success and response.data <> invalid
        row = m.categoryRows.content.getChild(rowIndex)
        categoryData = m.categoryData[rowIndex]

        ' Check if this is the requests row
        if categoryData <> invalid and categoryData.isRequestsRow = true
            ' The /api/v1/request endpoint returns minimal data, so we need to enrich each request
            results = response.data.results
            if results <> invalid and type(results) = "roArray"
                ' Store requests to process
                m.requestsToEnrich = []
                m.enrichedRequestItems = []
                m.requestsRowIndex = rowIndex

                for i = 0 to results.Count() - 1
                    request = results[i]
                    if request.media <> invalid and request.media.tmdbId <> invalid
                        requestInfo = {
                            tmdbId: request.media.tmdbId,
                            type: request.type,
                            mediaInfo: request.media
                        }
                        m.requestsToEnrich.Push(requestInfo)
                    end if
                end for

                ' Start fetching full details for each request
                if m.requestsToEnrich.Count() > 0
                    EnrichNextRequest()
                end if
            end if
        else
            ' Handle regular discovery data
            results = response.data.results

            if results <> invalid and type(results) = "roArray"
                config = GetJellyseerrConfig()
                blockNsfw = true
                if config <> invalid and config.blockNsfw <> invalid
                    blockNsfw = config.blockNsfw
                end if

                ' Three-stage filter: library availability, blacklist, NSFW
                filteredResults = []
                blockedAvailable = 0
                blockedBlacklisted = 0
                blockedNsfw = 0

                for i = 0 to results.Count() - 1
                    item = results[i]
                    includeItem = true

                    if IsItemAvailable(item)
                        includeItem = false
                        blockedAvailable = blockedAvailable + 1
                    else if IsItemBlacklisted(item)
                        includeItem = false
                        blockedBlacklisted = blockedBlacklisted + 1
                    else if blockNsfw and IsItemNsfw(item)
                        includeItem = false
                        blockedNsfw = blockedNsfw + 1
                    end if

                    if includeItem
                        filteredResults.push(item)
                    end if
                end for

                results = filteredResults
                row = m.categoryRows.content.getChild(rowIndex)

                itemsAdded = 0
                for i = 0 to results.Count() - 1
                    item = results[i]

                    mediaNode = CreateMediaContentNode(item)
                    if mediaNode <> invalid
                        row.appendChild(mediaNode)
                        itemsAdded = itemsAdded + 1
                    end if
                end for

                m.categoryRows.content = m.categoryRows.content

                if rowIndex = 0 and not m.categoryRows.hasFocus()
                    m.categoryRows.setFocus(true)
                    m.categoryRows.jumpToRowItem = [0, 0]
                end if
            end if
        end if
    else
        errorMsg = "Failed to load media"
        if response.error <> invalid
            errorMsg = errorMsg + ": " + response.error
        end if

        ShowError(errorMsg)
    end if

end sub

sub ShowMediaDetails(mediaItem as object)
    detailsScreen = CreateObject("roSGNode", "JellyseerrDetailsScreen")
    detailsScreen.mediaItem = mediaItem
    m.top.getScene().appendChild(detailsScreen)
    detailsScreen.setFocus(true)
end sub

sub ShowLoading()
    m.loadingLabel.visible = true
    m.errorLabel.visible = false
end sub

sub HideLoading()
    m.loadingLabel.visible = false
end sub

sub ShowError(message as string)
    m.errorLabel.text = message
    m.errorLabel.visible = true
    m.loadingLabel.visible = false
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    ' Open Jellyseerr Settings with * key
    if key = "*"
        settingsScreen = CreateObject("roSGNode", "JellyseerrSettingsScreen")
        m.top.getScene().appendChild(settingsScreen)
        settingsScreen.setFocus(true)
        return true
    end if

    ' Handle back button
    if key = "back"
        m.global.sceneManager.callFunc("popScene")
        return true
    end if

    return false
end function

' Enrich requests by fetching full TMDB details
sub EnrichNextRequest()
    if m.requestsToEnrich.Count() = 0
        ' All requests enriched, update the row
        row = m.categoryRows.content.getChild(m.requestsRowIndex)
        for each item in m.enrichedRequestItems
            row.appendChild(item)
        end for
        m.categoryRows.content = m.categoryRows.content
        return
    end if

    ' Get next request to enrich
    requestInfo = m.requestsToEnrich.Shift()
    tmdbId = requestInfo.tmdbId
    mediaType = requestInfo.type

    ' Create API task for this request
    enrichTask = CreateObject("roSGNode", "JellyseerrAPITask")
    endpoint = "/api/v1/" + mediaType + "/" + tmdbId.toStr()

    enrichTask.request = {
        method: "GET",
        endpoint: endpoint
    }

    enrichTask.observeField("response", "onEnrichResponse")

    ' Store current request info for the callback
    m.currentEnrichRequest = requestInfo

    enrichTask.control = "RUN"
end sub

sub onEnrichResponse(event as object)
    response = event.getData()
    requestInfo = m.currentEnrichRequest

    if response.success and response.data <> invalid
        ' Create content node from full TMDB details
        mediaNode = CreateMediaContentNode(response.data)
        if mediaNode <> invalid
            ' Add the media info from the request
            mediaNode.addField("mediaInfo", "assocarray", false)
            mediaNode.mediaInfo = requestInfo.mediaInfo
            m.enrichedRequestItems.Push(mediaNode)
        end if
    end if

    ' Process next request
    EnrichNextRequest()
end sub


