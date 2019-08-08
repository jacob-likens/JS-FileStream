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
        mode: "read",
        defaultFileName: "file",
    };

    // Our position inside the current cache
    position = 0;
    // The index of our chunk
    chunk = 0;

    constructor (blob, config = null)
    {
        // Basic type checking
        if (!(blob instanceof Blob) && !(blob instanceof File)) throw new Error("Invalid parameter for blob/file.");
        if (config instanceof Object) {
            this.config = {...this.config, ...config};
        } else if(config !== null) {
            throw new Error("Invalid parameter for configuration.");
        }
        
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
        return this.cache[this.position++];
    }

    /**
     *Reads a byte from the stream.
     *
     * @returns {number}
     * @memberof FileStream
     */
    read ()
    {
        if (this.EOF) return null;
        if (this.position === this.cache.length)
        {
            // Read the next chunk
            this.readChunk(this.chunks[this.chunk + 1]);
        }
        return this.r();
    }

    seek (offset)
    {
        if (offset > this.blob.size || offset < 0) throw new Error("Attempted to seek to an invalid offset.");
        const chunk = this.getChunkIndexFromOffset(offset);
        if (chunk !== this.chunk) {
            this.readChunk(chunk);
        }
        this.position = this.newLocalOffset(offset);
    }

    seekLocal (offset)
    {
        if (offset > this.config.chunkSize || offset < 0) throw new Error("Attempted to seek to an invalid offset.");
        this.position = offset;
        return this.tell();
    }

    getChunkIndexFromOffset (offset)
    {
        if (offset > this.blob.size) throw new Error("Attempted to find a chunk index from an invalid offset");
        return Math.ceil(offset / this.config.chunkSize);
    }

    get newLocalOffset (realOffset)
    {
        return (realOffset % this.config.chunkSize);
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
}