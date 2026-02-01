package com.umeshsolanki.dockermanager.file
import com.umeshsolanki.dockermanager.*

import java.io.File
import java.io.InputStream

interface IFileManagerService {
    fun listFiles(subPath: String = ""): List<FileItem>
    fun deleteFile(path: String): Boolean
    fun createDirectory(path: String): Boolean
    fun zip(sourcePath: String, targetName: String): File?
    fun zipMultiple(paths: List<String>, targetName: String): File?
    fun unzip(zipPath: String, targetPath: String): Boolean
    fun getFile(path: String): File?
    fun saveFile(path: String, inputStream: InputStream): Boolean
    fun readFileContent(path: String, maxBytes: Long = 512 * 1024, startFromEnd: Boolean = false): String?
    fun saveFileContent(path: String, content: String): Boolean
    fun renameFile(path: String, newName: String): Boolean
}
