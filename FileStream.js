const BYTE = 1;
const KILOBYTE = BYTE * 1024;
const MEGABYTE = KILOBYTE * 1024;
const GIGABYTE = MEGABYTE * 1024;

/**
 *A filestream class designed for large files. Reads given blobs in chunks.
 *
 * @class FileStream
 */
class FileStream
{
    config = {
        chunkSize: KILOBYTE,
        splitPattern: [],
        readAll: false,
        type: "binary",
        mode: "r",
        defaultFileName: "file",
    };

    // Our position inside the current cache
    position = 0;
    // The index of our chunk
    chunk = 0;

    closed = true;

    constructor (config = this.config)
    {
        if (config instanceof Object) {
            this.config = {...this.config, ...config};
        } else if(config !== null) {
            throw new Error("Invalid parameter for configuration.");
        }

        // reading mode
        if (this.config.mode.includes("r")) {
            // Generic functions and binary
            this.open = GenericRead.open;
            this.r = GenericRead.r;
            this.read = GenericRead.read;
            this.readChunk = GenericRead.readChunk;
            this.sliceChunk = GenericRead.sliceChunk;
            this.seek = GenericRead.seek;
            this.seekLocal = GenericRead.seekLocal;

            // Textmode
            if (this.config.type === "text") {
                this.readLine = TextRead.readLine;
                this.readLines = TextRead.readLines;
            }
        }
    }

    tell ()
    {
        return this.offset + (this.chunkSize * this.chunk);
    }

    get EOF()
    {
        return (this.tell() > this.blob.size);
    }

    get currentByte ()
    {
        return this.cache[this.position];
    }

    get writeable ()
    {
        return  this.config.mode.includes("w");
    }
}

class GenericRead
{

    /**
     *Opens the given blob into the file stream
     *
     * @param {blob} The blob or file to open
     * @returns {blob}
     * @memberof FileStream
     */
    open (blob)
    {
        // Basic type checking
        if (!(blob instanceof Blob) && !(blob instanceof File)) throw new Error("Invalid parameter for blob/file.");
        
        // Set up our internal data
        this.cache = null;
        this.blob = blob;
        this.fileName = (blob instanceof File) ? (this.config.defaultFileName === "file" ? blob.name : this.config.defaultFileName) : this.config.defaultFileName;

        this.lastChunk = Math.ceil(blob.size / this.config.chunkSize);

        this.chunks = new Array(this.lastChunk).fill(0);
        this.chunks.map((_, i) =>
        {
            return this.sliceChunk(i);
        });

        this.readChunk(0);
        this.closed = false;
    }


    /**
     *Seeks to a place within the stream, where the offset given is out of the total bytes in the blob
     *
     * @param {number} offset the offset in the file to seek to
     * @memberof FileStream
     */
    seek (offset)
    {
        const newChunkIndex = (offset) =>
        {
            if (offset > this.blob.size) throw new Error("Attempted to find a chunk index from an invalid offset");
            return Math.ceil(offset / this.config.chunkSize);
        }

        if (offset > this.blob.size || offset < 0) throw new Error("Attempted to seek to an invalid offset.");
        const chunk = newChunkIndex(offset);
        if (chunk !== this.chunk) {
            this.readChunk(chunk);
        }

        //Move our position relative to the chunk
        this.position = offset % this.config.chunkSize;
    }

    /**
     *Seeks to a position within the local chunk
     *
     * @param {number} index the index of the chunk to slice
     * @returns {number} Current position in the file
     * @memberof FileStream
     */
    seekLocal (offset)
    {
        if (offset > this.config.chunkSize || offset < 0) throw new Error("Attempted to seek to an invalid offset.");
        this.position = offset;
        return this.tell();
    }

    skip (amount)
    {
        for (let i = 0; i < amount; ++i) {
            this.r();
            if (this.EOF) return i;
        }

        return amount;
    }

    /**
     *Slices the specified chunk index from the blob, returning the slice
     *
     * @param {number} index the index of the chunk to slice
     * @returns {blob}
     * @memberof FileStream
     */
    sliceChunk (index)
    {
        if (index > this.lastChunk) throw new Error(`Attempted to access a chunk beyond the bounds of the blob: ${index}`);
        const offset = index * this.config.chunkSize;
        return this.blob.slice(offset, this.config.chunkSize + offset);
    }

    /**
     *Reads the specified chunk into the cache
     *
     * @param {number} index
     * @memberof FileStream
     */
    readChunk (index)
    {        
        if (index > this.lastChunk) throw new Error(`Attempted to access a chunk beyond the bounds of the blob: ${index}`);
        const READERROR = `Error reading chunk ${index} in file`;
        
        // Set our chunk, reset our position
        this.chunk = index;
        this.position = 0;
        
        const reader = new FileReader();
        reader.onload = (event) => { if (event.target.error === null) this.cache = new Uint8Array(event.target.result); else throw new Error(READERROR); }
        reader.readAsArrayBuffer(this.chunks[this.chunk]);
        
    }

    /**
     *Internal function for reading from the blob, intended to be overloaded
     *
     * @returns {number}
     * @memberof FileStream
     */
    r ()
    {
        if (this.EOF) return null;
        if (this.position === this.cache.length)
        {
            // Read the next chunk
            this.readChunk(this.chunks[this.chunk + 1]);
        }
        return this.cache[this.position++];
    }

    /**
     *Reads from the streams byte buffer. 
     *If array is supplied, Bytes read will be stored inside of it. 
     *If offset and len are given, it will store the given number of bytes starting at the offset.
     * 
     * @param {number[]=} array Array to store read values
     * @param {number=} offset The starting index of {@link array} to read into
     * @param {number=} len The amount of bytes to read
     * @returns {number} If no arguments, the byte read from the stream. If arguments, the number of bytes read.
     * @memberof InputStream
     */
    read ()
    {
        let array, offset, len, bytesRead;
        switch (arguments.length) {
            case 0:
                return this.r();
            case 1:
                array = arguments[0];
                if(!isArray(array)) throw this.invalidArgError;
                bytesRead = 0;
                for(; bytesRead < array.length && this.currentByte != null; ++bytesRead) array[bytesRead] = this.r();
                return array;
            case 3:
                [array, offset, len] = arguments;
                if(!isArray(array)) throw this.invalidArgError;
                bytesRead = 0;
                for(; bytesRead < len && this.currentByte != null; ++bytesRead) array[bytesRead + offset] = this.r();
                return bytesRead;
            default:
                throw new Error("Invalid arguments for stream read function");
        }
    }
}

class TextRead
{
    currentLine = 0;

    readLine ()
    {
        let byte;
        let s = "";
        while ( (byte = this.r()) !== 0x0A) {
            if (byte === null) break;
            s += String.fromCharCode(byte);
        }
        ++this.currentLine;
        return s;
    }

    readLines(amount)
    {
        let s = [];
        for (let i = 0; i < amount; ++i) {

            const str = this.readLine();
            s.push(str);

            if(str.charCodeAt(str.length - 1) !== 0x0A) {
                // Warn for potential unexpected EOF
                (i + 1 !== amount) ? console.warn("Reached end of stream before we could read all given lines!") : null;
                break;
            }
        }
        return s.join("\n");
    }
}