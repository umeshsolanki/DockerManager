package com.umeshsolanki.dockermanager.file
import com.umeshsolanki.dockermanager.*
import com.umeshsolanki.dockermanager.file.FileItem

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import org.slf4j.LoggerFactory

class FileManagerServiceImpl : IFileManagerService {
    private val logger = LoggerFactory.getLogger(FileManagerServiceImpl::class.java)
    private val baseDir = AppConfig.fileManagerDir

    init {
        if (!baseDir.exists()) {
            baseDir.mkdirs()
        }
    }

    private fun resolvePath(path: String): File {
        val file = File(baseDir, path).canonicalFile
        if (!file.path.startsWith(baseDir.canonicalPath)) {
            throw SecurityException("Access outside of file manager directory is not allowed")
        }
        return file
    }

    override fun listFiles(subPath: String): List<FileItem> {
        val dir = resolvePath(subPath)
        if (!dir.exists() || !dir.isDirectory) return emptyList()

        return dir.listFiles()?.map { file ->
            FileItem(
                name = file.name,
                path = file.absolutePath.removePrefix(baseDir.absolutePath).removePrefix(File.separator),
                size = if (file.isDirectory) 0 else file.length(),
                isDirectory = file.isDirectory,
                lastModified = file.lastModified(),
                extension = if (file.isDirectory) null else file.extension
            )
        } ?: emptyList()
    }

    override fun deleteFile(path: String): Boolean {
        return try {
            val file = resolvePath(path)
            if (file.isDirectory) {
                file.deleteRecursively()
            } else {
                file.delete()
            }
        } catch (e: Exception) {
            logger.error("Error deleting file $path", e)
            false
        }
    }

    override fun createDirectory(path: String): Boolean {
        return try {
            val dir = resolvePath(path)
            dir.mkdirs()
        } catch (e: Exception) {
            logger.error("Error creating directory $path", e)
            false
        }
    }

    override fun zip(sourcePath: String, targetName: String): File? {
        return zipMultiple(listOf(sourcePath), targetName)
    }

    override fun zipMultiple(paths: List<String>, targetName: String): File? {
        return try {
            val zipFile = resolvePath(targetName.let { if (it.endsWith(".zip")) it else "$it.zip" })
            
            ZipOutputStream(FileOutputStream(zipFile)).use { zos ->
                paths.forEach { sourcePath ->
                    val sourceFile = resolvePath(sourcePath)
                    sourceFile.walkTopDown().forEach { file ->
                        val zipEntryName = if (file == sourceFile) {
                             file.name
                        } else {
                             file.absolutePath.removePrefix(sourceFile.parentFile.absolutePath).removePrefix(File.separator)
                        }
                        
                        if (file.isDirectory) {
                            // Only add directory entries if they are empty or we want the structure
                            // walkTopDown will visit children anyway
                            val entryPath = if (zipEntryName.endsWith("/")) zipEntryName else "$zipEntryName/"
                            zos.putNextEntry(ZipEntry(entryPath))
                            zos.closeEntry()
                        } else {
                            zos.putNextEntry(ZipEntry(zipEntryName))
                            FileInputStream(file).use { fis ->
                                fis.copyTo(zos)
                            }
                            zos.closeEntry()
                        }
                    }
                }
            }
            zipFile
        } catch (e: Exception) {
            logger.error("Error zipping multiple files to $targetName", e)
            null
        }
    }

    override fun unzip(zipPath: String, targetPath: String): Boolean {
        return try {
            val zipFile = resolvePath(zipPath)
            val targetDir = resolvePath(targetPath)
            if (!targetDir.exists()) targetDir.mkdirs()

            ZipInputStream(FileInputStream(zipFile)).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    val newFile = File(targetDir, entry.name)
                    // Validate path to prevent Zip Slip vulnerability
                    if (!newFile.canonicalPath.startsWith(targetDir.canonicalPath)) {
                        throw SecurityException("Zip entry is outside of target directory: ${entry.name}")
                    }

                    if (entry.isDirectory) {
                        newFile.mkdirs()
                    } else {
                        newFile.parentFile.mkdirs()
                        FileOutputStream(newFile).use { fos ->
                            zis.copyTo(fos)
                        }
                    }
                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }
            true
        } catch (e: Exception) {
            logger.error("Error unzipping $zipPath to $targetPath", e)
            false
        }
    }

    override fun getFile(path: String): File? {
        return try {
            val file = resolvePath(path)
            if (file.exists() && file.isFile) file else null
        } catch (e: Exception) {
            null
        }
    }

    override fun saveFile(path: String, inputStream: InputStream): Boolean {
        return try {
            val file = resolvePath(path)
            file.parentFile.mkdirs()
            FileOutputStream(file).use { fos ->
                inputStream.copyTo(fos)
            }
            true
        } catch (e: Exception) {
            logger.error("Error saving file $path", e)
            false
        }
    }

    override fun readFileContent(path: String, maxBytes: Long, startFromEnd: Boolean): String? {
        return try {
            val file = resolvePath(path)
            if (!file.exists() || !file.isFile) return null
            
            val length = file.length()
            if (length == 0L) return ""
            
            val bytesToRead = java.lang.Math.min(length, maxBytes).toInt()
            val byteArray = ByteArray(bytesToRead)
            
            java.io.RandomAccessFile(file, "r").use { raf ->
                if (startFromEnd && length > maxBytes) {
                    raf.seek(length - maxBytes)
                }
                raf.readFully(byteArray)
            }
            
            String(byteArray, Charsets.UTF_8)
        } catch (e: Exception) {
            logger.error("Error reading file content $path", e)
            null
        }
    }
}

// Service object for easy access
object FileService {
    private val service: IFileManagerService = FileManagerServiceImpl()
    
    fun listFiles(subPath: String = "") = service.listFiles(subPath)
    fun deleteFile(path: String) = service.deleteFile(path)
    fun createDirectory(path: String) = service.createDirectory(path)
    fun zipFile(sourcePath: String, targetName: String) = service.zip(sourcePath, targetName)
    fun zipMultipleFiles(paths: List<String>, targetName: String) = service.zipMultiple(paths, targetName)
    fun unzipFile(zipPath: String, targetPath: String) = service.unzip(zipPath, targetPath)
    fun getFile(path: String) = service.getFile(path)
    fun saveFile(path: String, inputStream: InputStream) = service.saveFile(path, inputStream)
    fun readFileContent(path: String, maxBytes: Long = 512 * 1024, startFromEnd: Boolean = false) = service.readFileContent(path, maxBytes, startFromEnd)
}
