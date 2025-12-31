package com.umeshsolanki.dockermanager.jna

import com.sun.jna.*
import com.sun.jna.Structure.FieldOrder

@FieldOrder(
    "ut_type", "ut_pid", "ut_line", "ut_id",
    "ut_user", "ut_host", "ut_exit",
    "ut_session", "ut_tv", "ut_addr_v6", "unused"
)
class Utmpx : Structure() {
    @JvmField var ut_type: Short = 0
    @JvmField var ut_pid: Int = 0
    @JvmField var ut_line = ByteArray(32)
    @JvmField var ut_id = ByteArray(4)
    @JvmField var ut_user = ByteArray(32)
    @JvmField var ut_host = ByteArray(256)
    @JvmField var ut_exit = ByteArray(4)
    @JvmField var ut_session: Int = 0
    @JvmField var ut_tv = Timeval()
    @JvmField var ut_addr_v6 = IntArray(4)
    @JvmField var unused = ByteArray(20)
}

@FieldOrder("tv_sec", "tv_usec")
class Timeval : Structure() {
    @JvmField var tv_sec: Long = 0
    @JvmField var tv_usec: Long = 0
}
