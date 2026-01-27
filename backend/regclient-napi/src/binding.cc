#include <napi.h>
#include <stdlib.h>
#include "main.h"

using namespace Napi;

class GetImageInfoWorker : public AsyncWorker {
    public:
        GetImageInfoWorker(Function& callback, std::string& imageRef, std::string& username, std::string& password, std::string& overrideTLSHostname, std::string& overrideTLSState)
        : AsyncWorker(callback), imageRef(imageRef), username(username), password(password), overrideTLSHostname(overrideTLSHostname), overrideTLSState(overrideTLSState) {}

        ~GetImageInfoWorker() {}

    void Execute() override {
        result = GetImageInfo((char*) imageRef.c_str(), (char*) username.c_str(), (char*) password.c_str(), (char*) overrideTLSHostname.c_str(), (char*) overrideTLSState.c_str());
    }

    void OnOK() override {
        HandleScope scope(Env());
        Callback().Call({Env().Null(), String::New(Env(), result)});
    }

    private:
        std::string imageRef;
        std::string result;
        std::string overrideTLSHostname;
        std::string overrideTLSState;
        std::string username;
        std::string password;
};

Value GetImageInfoWrapper(const CallbackInfo& info) {
    std::string imageRef = info[0].As<String>().Utf8Value();
    std::string username = info[1].As<String>().Utf8Value();
    std::string password = info[2].As<String>().Utf8Value();
    std::string overrideTLSHostname = info[3].As<String>().Utf8Value();
    std::string overrideTLSState = info[4].As<String>().Utf8Value();
    Function callback = info[5].As<Function>();

    GetImageInfoWorker* wk = new GetImageInfoWorker(callback, imageRef, username, password, overrideTLSHostname, overrideTLSState);
    wk->Queue();

    return info.Env().Undefined();
}

Object Init(Env env, Object exports) {
    exports.Set("getImageInfo", Function::New(env, GetImageInfoWrapper));
    return exports;
}

NODE_API_MODULE(addon, Init)
