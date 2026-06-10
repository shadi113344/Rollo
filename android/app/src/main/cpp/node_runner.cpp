#include <jni.h>
#include <cstdlib>
#include <cstring>
#include "node.h"

// Kotlin object NodeRunner — @JvmStatic external startNodeWithArguments
extern "C" JNIEXPORT jint JNICALL
Java_com_rollo_app_NodeRunner_startNodeWithArguments(
    JNIEnv *env,
    jclass /* clazz */,
    jobjectArray arguments) {
    jsize argument_count = env->GetArrayLength(arguments);

    int c_arguments_size = 0;
    for (jsize i = 0; i < argument_count; i++) {
        auto jstr = (jstring)env->GetObjectArrayElement(arguments, i);
        const char *arg = env->GetStringUTFChars(jstr, nullptr);
        c_arguments_size += static_cast<int>(strlen(arg)) + 1;
        env->ReleaseStringUTFChars(jstr, arg);
    }

    char *args_buffer = static_cast<char *>(calloc(static_cast<size_t>(c_arguments_size), 1));
    if (!args_buffer) {
        return -1;
    }

    auto **argv = static_cast<char **>(calloc(static_cast<size_t>(argument_count), sizeof(char *)));
    if (!argv) {
        free(args_buffer);
        return -1;
    }

    char *current_args_position = args_buffer;
    for (jsize i = 0; i < argument_count; i++) {
        auto jstr = (jstring)env->GetObjectArrayElement(arguments, i);
        const char *current_argument = env->GetStringUTFChars(jstr, nullptr);
        strncpy(current_args_position, current_argument, strlen(current_argument));
        argv[i] = current_args_position;
        current_args_position += strlen(current_args_position) + 1;
        env->ReleaseStringUTFChars(jstr, current_argument);
    }

    int result = node::Start(static_cast<int>(argument_count), argv);

    free(argv);
    free(args_buffer);
    return static_cast<jint>(result);
}
