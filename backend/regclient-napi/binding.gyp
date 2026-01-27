{
  "targets": [
    {
      "target_name": "regclient_napi",
      "sources": [ "src/binding.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "./gobuild",
      ],
      "conditions": [
        ["OS=='linux'", {
          "libraries": [ "-lpthread", "-ldl" ],
          "cflags": [ "-Werror" ]
        }]
      ],
      "libraries": [ "<!(pwd)/gobuild/main.a" ],
      "defines": [
        "NODE_ADDON_API_DISABLE_CPP_EXCEPTIONS"
      ]
    }
  ]
}
