package com.umeshsolanki.dockermanager.jna

import com.sun.jna.*
import com.sun.jna.Structure.FieldOrder

@FieldOrder(
    "ut_type", "__pad1", "ut_pid", "ut_line", "ut_id",
    "ut_user", "ut_host", "ut_exit",
    "ut_session", "ut_tv", "ut_addr_v6", "unused"
)
class Utmpx : Structure() {
    @JvmField var ut_type: Short = 0
    @JvmField var __pad1: Short = 0
    @JvmField var ut_pid: Int = 0
    @JvmField var ut_line = ByteArray(32)
    @JvmField var ut_id = ByteArray(4)
    @JvmField var ut_user = ByteArray(32)
    @JvmField var ut_host = ByteArray(256)
    @JvmField var ut_exit = UtExitStatus()
    @JvmField var ut_session: Int = 0
    @JvmField var ut_tv = UtTimeval()
    @JvmField var ut_addr_v6 = IntArray(4)
    @JvmField var unused = ByteArray(20)
}

@FieldOrder("e_termination", "e_exit")
class UtExitStatus: Structure() {
    @JvmField var e_termination: Short = 0
    @JvmField var e_exit: Short = 0
}

@FieldOrder("tv_sec", "tv_usec")
class UtTimeval : Structure() {
    @JvmField var tv_sec: Int = 0
    @JvmField var tv_usec: Int = 0
}

