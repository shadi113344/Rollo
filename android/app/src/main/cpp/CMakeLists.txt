cmake_minimum_required(VERSION 3.22.1)
project("rollo-node")

add_library(
    rollo-node
    SHARED
    node_runner.cpp
)

include_directories(${CMAKE_SOURCE_DIR}/../../../libnode/include/node/)

add_library(libnode SHARED IMPORTED)
set_target_properties(
    libnode
    PROPERTIES IMPORTED_LOCATION
    ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so
)

find_library(log-lib log)

target_link_libraries(
    rollo-node
    libnode
    ${log-lib}
)
