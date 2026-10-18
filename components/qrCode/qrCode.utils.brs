' Appends the given number of low-order bits of the given value
' to the given buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.
function appendBits(value as integer, length as integer, bb as object)
    if ((length < 0) or (length > 31) or (value >> length <> 0)) then
        throw("Value out of range")
    end if
    for i = length - 1 to 0 step -1 ' Append bit by bit
        bb.push((value >> i) and 1)
    next
end function


' Returns true iff the i'th bit of x is set to 1.
function getBit(x as integer, i as integer) as boolean
    return ((x >> i) and 1) <> 0
end function


' Throws an exception if the given condition is false.
function assert(condition as boolean)
    if (not condition) then
        throw("Assertion error")
    end if
end function


'Since Brightscript doesn't have a XOR operator, we use this function to calculate it.
function xor(x, y)
    if type(x) = "roInvalid" then x = 0
    if type(y) = "roInvalid" then y = 0
    return (x or y) - (x and y)
end function


function iif(check as boolean, yes as dynamic, no as dynamic) as dynamic
    if check then
        return yes
    end if
    return no
end function

function floor(f as float) as integer
    return int(f)
end function

function ceil(f as float) as integer
    return int(f + 0.999)
end function

function min(a, b)
    if a < b then return a
    return b
end function

function max(a, b)
    if a > b then return a
    return b
end function

function slice(array as object, start = 0 as integer, finish = 0 as integer) as object
    size = array.count() - 1
    if (start < 0) then
        start += size
    end if
    if (finish = 0 or finish >= size) then
        finish = size + 1
    else if (finish < 0) then
        finish += size
    end if
    new = []
    for x = start to finish - 1
        new.push(array[x])
    next
    return new
end function

function concat(array1 as object, array2 as object) as object
    new = []
    new.append(array1)
    new.append(array2)
    return new
end function

function splice(array as object, start as integer, delete = 999999 as integer, insert = [] as object)
    if start > array.count() then start = array.count()
    if start < 0 then start = array.count() - start
    if start < 0 then start = 0
    if delete < 0 then delete = 0
    for d = 1 to delete
        array.delete(start)
    next
    tmp = []
    tmp.append(insert)
    while(array.count() > start)
        tmp.push(array[start])
        array.delete(start)
    end while
    array.append(tmp)
    return array
end function

function infinity()
    return 999999
end function

function joinNums(array as object, sep = ", " as string) as string
    ret = ""
    for each item in array
        if ret <> "" then
            ret += sep
        end if
        if type(item) = "Invalid" then
            ret += "invalid"
        else
            ret += item.toStr()
        end if
    next
    return ret
end function

function isNullOrEmpty(obj as object) as boolean
    if type(obj) = "Invalid" or type(obj) = "roInvalid" then
        return true
    else if obj = "" then
        return true
    end if
    return false
end function
