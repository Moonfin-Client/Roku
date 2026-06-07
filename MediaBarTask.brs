'import "pkg:/source/api/sdk.bs"
'import "pkg:/source/utils/misc.bs"

sub init()
    m.top.functionName = "getMediaBarData"
end sub

sub getMediaBarData()
    sourceType = LCase((function(m)
            __bsConsequent = m.top.sourceType
            if __bsConsequent <> invalid then
                return __bsConsequent
            else
                return "library"
            end if
        end function)(m))
    allowedCollectionTypes = getAllowedCollectionTypes()
    includeTypes = getAllowedIncludeTypes()
    selectedLibraryIds = parseStringArraySetting(m.top.selectedLibraryIds)
    selectedCollectionIds = parseStringArraySetting(m.top.selectedCollectionIds)
    excludedGenreIds = parseStringArraySetting(m.top.excludedGenreIds)
    excludedGenreNames = getExcludedGenreNames(excludedGenreIds)
    parentIds = []
    if sourceType = "collection"
        if selectedCollectionIds.count() > 0
            parentIds = selectedCollectionIds
        else
            parentIds = getCollectionAndPlaylistIds()
        end if
    else
        parentIds = getLibraryIds(allowedCollectionTypes)
        if selectedLibraryIds.count() > 0
            parentIds = filterIdsBySelection(parentIds, selectedLibraryIds)
        end if
    end if
    if parentIds.count() = 0
        m.top.mediaBarData = {
            items: []
        }
        return
    end if
    allItems = []
    currentTime = CreateObject("roDateTime")
    currentMiliseconds = int(currentTime.GetMilliseconds())
    for each parentId in parentIds
        data = api_items_Get({
            userId: m.top.userId
            parentId: parentId
            includeItemTypes: includeTypes
            recursive: true
            sortBy: "Random"
            hasBackdrop: true
            limit: 50
	    ' startIndex Must be after limit
            startIndex: currentMiliseconds
            fields: "Overview,Genres,CommunityRating,OfficialRating,ProductionYear,RunTimeTicks,ProviderIds"
        })
        if isChainValid(data, "items") then
            items = data.items
        else
            items = []
        end if
        if excludedGenreNames.count() > 0
            items = filterItemsByExcludedGenres(items, excludedGenreNames)
        end if
        allItems.append(items)
    end for
    m.top.mediaBarData = {
        items: allItems
    }
end sub

function getAllowedCollectionTypes() as object
    contentType = m.top.contentType
    if contentType = "movies"
        return [
            "movies"
        ]
    else if contentType = "tvshows"
        return [
            "tvshows"
        ]
    end if
    return [
        "movies"
        "tvshows"
    ]
end function

function getAllowedIncludeTypes() as string
    contentType = m.top.contentType
    if contentType = "movies" then
        return "Movie"
    end if
    if contentType = "tvshows" then
        return "Series"
    end if
    return "Movie,Series"
end function

function parseStringArraySetting(value as dynamic) as object
    if not isValid(value) then
        return []
    end if
    valueType = type(value)
    if valueType = "roArray" or valueType = "Array"
        result = []
        for each item in value
            if isValidAndNotEmpty(item)
                result.push(item.toStr())
            end if
        end for
        return result
    end if
    parsed = ParseJson(value.toStr())
    if type(parsed) = "roArray" or type(parsed) = "Array"
        result = []
        for each item in parsed
            if isValidAndNotEmpty(item)
                result.push(item.toStr())
            end if
        end for
        return result
    end if
    return []
end function

function filterIdsBySelection(candidateIds as object, selectedIds as object) as object
    selectedSet = {}
    for each id in selectedIds
        selectedSet[id.toStr()] = true
    end for
    filtered = []
    for each id in candidateIds
        if selectedSet.DoesExist(id.toStr())
            filtered.push(id)
        end if
    end for
    return filtered
end function

function getCollectionAndPlaylistIds() as object
    ids = []
    data = api_items_Get({
        userId: m.top.userId
        includeItemTypes: "BoxSet,Playlist"
        recursive: true
        sortBy: "SortName"
        sortOrder: "Ascending"
        limit: 500
    })
    if not isChainValid(data, "items") then
        return ids
    end if
    for each item in data.items
        if isValidAndNotEmpty(item.id)
            ids.push(item.id)
        end if
    end for
    return ids
end function

function getExcludedGenreNames(excludedGenreIds as object) as object
    names = {}
    if not isValidAndNotEmpty(excludedGenreIds) then
        return names
    end if
    selected = {}
    for each id in excludedGenreIds
        selected[LCase(id.toStr())] = true
    end for
    genres = api_genres_Get({
        userId: m.top.userId
        sortBy: "SortName"
        sortOrder: "Ascending"
    })
    if not isChainValid(genres, "items") then
        return names
    end if
    for each genre in genres.items
        genreId = LCase(((function(genre)
                __bsConsequent = genre.id
                if __bsConsequent <> invalid then
                    return __bsConsequent
                else
                    return ""
                end if
            end function)(genre)).toStr())
        genreName = ((function(genre)
                __bsConsequent = genre.name
                if __bsConsequent <> invalid then
                    return __bsConsequent
                else
                    return ""
                end if
            end function)(genre)).toStr()
        if selected.DoesExist(genreId) and isValidAndNotEmpty(genreName)
            names[LCase(genreName)] = true
        end if
    end for
    return names
end function

function filterItemsByExcludedGenres(items as object, excludedGenreNames as object) as object
    filtered = []
    for each item in items
        itemGenres = (function(item)
                __bsConsequent = item.LookupCI("Genres")
                if __bsConsequent <> invalid then
                    return __bsConsequent
                else
                    return []
                end if
            end function)(item)
        shouldExclude = false
        for each genre in itemGenres
            if excludedGenreNames.DoesExist(LCase(genre.toStr()))
                shouldExclude = true
                exit for
            end if
        end for
        if not shouldExclude
            filtered.push(item)
        end if
    end for
    return filtered
end function

function getLibraryIds(allowedTypes as object) as object
    ids = []
    views = api_GetUserViews({
        userId: m.top.userId
    })
    if not isChainValid(views, "items") then
        return ids
    end if
    for each lib in views.items
        collectionType = LCase((function(lib)
                __bsConsequent = lib.LookupCI("CollectionType")
                if __bsConsequent <> invalid then
                    return __bsConsequent
                else
                    return ""
                end if
            end function)(lib))
        if inArray(allowedTypes, collectionType)
            ids.push(lib.id)
        end if
    end for
    return ids
end function
'//# sourceMappingURL=./MediaBarTask.brs.map