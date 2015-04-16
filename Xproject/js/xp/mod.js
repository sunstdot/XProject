/**
 * @name xp.mod
 * @object
 * @namespace
 * @description 模块管理器
 * @example
 * 一般来说，本模块应该是初始加载JS。
 * <script type="text/javascript" src = "vfs://lib/mod.js"></script>
 * mod_config.js加载前，一般应先设置。
 * <script type="text/javascript" src = "vfs://lib/xp_mod_config.js"></script>
 * xp_mod_config为模块依赖表，内容为: xp.mod.config([{name:"render", path:"path", crc:"", loadDepend:["math", "device"], runDepend:["mod1", "mod2"], isCss:false, charset:"utf8", args:{}}], );
 * 其余模块使用xp.mod.define(name, factory); name为模块名，factory函数必须返回一个Object或function或JSON来代表这个模块
 * 应用启动前，也应设置模块依赖表xp.mod.config([{name:"render", path:"path", crc:"", loadDepend:["math", "device"], runDepend:["mod1", "mod2"], isCss:false, charset:"utf8", args:{}}], path);
 * 注意：如果模块在loadDepend上有循环依赖，则会加载后，无限等待
 * 调用具体模块的函数时，需要显示的调用，xp.mod.require([mod1, mod2], callback);
 */

xp = (function (xp) {
    "use strict";
    /** @exports module as xp.mod */
    var get, index, parseUrl, absUrl, modCheck, modInit, waitNext, callNext, zipArray, realPath, requireWindow, requireWorker, depend, okIndex = 1, module = {},
        table = {},
        global = [],
        list = [],
        call = [],
        wait = [];

    // 获得指定名字的模块
    get = function (str) {
        var i, n, r, arr;
        // 循环设置xp的模块，支持多层嵌套模块
        arr = str.split(".");
        for (i = 0, n = arr.length, r = self; i < n; i += 1) {
            r = r[arr[i]];
            if (!r) {
                return undefined;
            }
        }
        return r;
    };
    // 获得对象在数组中的偏移量
    index = function (obj, arr) {
        var i;
        for (i = arr.length - 1; i >= 0; i -= 1) {
            if (arr[i] === obj) {
                return i;
            }
        }
        return -1;
    };

    // 分析地址，返回[domain, path, query]
    parseUrl = function (url) {
        var i, domain;
        if (!url) {
            return ["", "", ""];
        }
        if (url.indexOf("file:///") === 0) {
            return ["file:///", url.slice(8), ""];
        }
        if (url.indexOf(":") === 1) {
            return ["file:///", url, ""];
        }
        i = url.indexOf("://");
        if (i > 0) {
            i = url.indexOf("/", i + 3);
        } else {
            domain = "";
            i = 0;
        }
        if (i > 0) {
            domain = url.slice(0, i);
            url = url.slice(i);
        } else if (i < 0) {
            domain = url;
            url = "/";
        }
        i = url.indexOf("?");
        if (i > 0) {
            return [domain, url.slice(0, i), url.slice(i + 1)];
        }
        return [domain, url, ""];
    };
    // 获得路径在指定url（或域、目录）的绝对地址方法
    absUrl = function (path, url, dir) {
        var i, len, arr;
        if (path.indexOf("://") > 0 || path.indexOf("//") === 0) {
            return path;
        }
        if (dir === undefined) {
            arr = parseUrl(url);
            url = arr[0];
            dir = arr[1];
        }
        if (path.charAt(0) === "/") {
            return url + path;
        }
        if (path.charAt(1) === ":") {
            return url + path;
        }
        i = 0;
        len = 1;
        while (path.charAt(i) === ".") {
            if (path.charAt(i + 1) === "." && path.charAt(i + 2) === "/") {
                i += 3;
                len += 1;
            } else if (path.charAt(i + 1) === "/") {
                i += 2;
            } else {
                break;
            }
        }
        if (len === 1) {
            len = dir.lastIndexOf("/");
            if (len + 1 < dir.length) {
                dir = dir.slice(0, len + 1);
            }
            return url + dir + ((i > 0) ? path.slice(i) : path);
        } else if (len > 1) {
            arr = dir.split("/");
            if (len < arr.length) {
                arr.length = arr.length - len;
                return url + arr.join("/") + "/" + ((i > 0) ? path.slice(i) : path);
            } else {
                return url + "/" + ((i > 0) ? path.slice(i) : path);
            }
        }
    };

    // 检查模块是否可以初始化方法
    modCheck = function (table, mod) {
        var i, j, m, arr2, arr1 = mod.loadDepend || [];
        // 检查加载依赖模块是否就绪
        for (i = arr1.length - 1; i >= 0; i -= 1) {
            m = table[arr1[i]];
            if (!m.ok) {
                return false;
            } else {
                // 要求加载依赖模块的运行依赖也必须就绪
                arr2 = m.runDepend || [];
                for (j = arr2.length - 1; j >= 0; j -= 1) {
                    if (!table[arr2[j]].ok) {
                        return false;
                    }
                }
            }
        }
        return true;
    };
    // 模块初始化方法
    modInit = function (mod, factory) {
        var i, n, r, s, value = factory(mod.path, mod.args),
        // 循环设置模块，支持多层嵌套模块
            arr = mod.name.split(".");
        if (!value) {
            throw ("invalid mod, " + mod.name);
        }
        for (i = 0, n = arr.length - 1, r = self; i < n; i++) {
            s = arr[i];
            if (!r[s]) {
                r[s] = {};
            }
            r = r[s];
        }
        s = arr[n];
        if (r[s]) {
            // 如果模块已存在，则进行域绑定
            s = r[s];
            if (s !== value) {
                for (i in value) {
                    if (value.hasOwnProperty(i)) {
                        if (s[i] !== undefined) {
                            throw ("mod bind conflict, " + mod.name + "." + i);
                        }
                        s[i] = value[i];
                    }
                }
            }
        } else {
            r[s] = value;
        }
        mod.ok = okIndex;
        delete mod.loading;
    };
    // 等待数组进一步方法，检查依赖数组，并调用回调函数
    waitNext = function (table, array, result) {
        var i, mod, b;
        for (i = wait.length - 2; i >= 0; i -= 2) {
            mod = wait[i];
            if (mod) {
                if (modCheck(table, mod)) {
                    result.push(mod);
                    wait[i] = undefined;
                    modInit(mod, wait[i + 1]);
                    b = true;
                }
            }
        }
        if (b) {
            waitNext(table, array, result);
        }
        return b;
    };
    // 回调数组进一步方法，检查依赖数组，并调用回调函数
    callNext = function (array, result, r) {
        var i, j, b, callback, depend, arr = [];
        for (i = array.length - 2; i >= 0; i -= 2) {
            callback = array[i];
            depend = array[i + 1];
            b = true;
            for (j = depend.length - 1; j >= 0; j -= 1) {
                if (depend[j]) {
                    if (index(depend[j], result) < 0) {
                        b = false;
                    } else {
                        depend[j] = undefined;
                    }
                }
            }
            if (b) {
                array[i] = undefined;
                arr.push(callback);
            }
        }
        // 紧缩数组
        if (arr.length > 0) {
            zipArray(array);
            for (i = arr.length - 1; i >= 0; i--) {
                arr[i](r);
            }
        }
    };
    // 紧缩数组
    zipArray = function (array) {
        var i, j = array.length;
        for (i = 0; i < j; i += 2) {
            if (!array[i]) {
                for (j -= 2; j > i; j -= 2) {
                    if (array[j]) {
                        array[i] = array[j];
                        array[i + 1] = array[j + 1];
                        break;
                    }
                }
                if (j <= i) {
                    break;
                }
            }
        }
        array.length = i;
    };

    // 获得模块的真实路径方法
    realPath = function (mod) {
        var s = mod.path;
        return (mod.crc) ? ((s.indexOf("?") > 0) ? s + "&" + mod.crc : s + "?" + mod.crc) : s;
    };

    // 浏览器的加载方法
    requireWindow = function (mod, head, doc) {
        var node = doc.createElement(mod.isCss ? 'link' : 'script'),
            e;
        node.charset = mod.charset || 'utf8';
        node.readyState = undefined;
        node.onerror = function () {
            node.onload = node.onerror = node.onreadystatechange = undefined;
            head.removeChild(node);
            delete mod.loading;
            e = [mod.name, mod.path];
            e.error = -13;
            e.reason = "load error";
            callNext(call, [mod], e);
        };
        node.onload = node.onreadystatechange = function () {
            /*if (node.readyState === 'loaded' ||
             node.readyState === 'complete' ||
             node.readyState === undefined) {
             };*/
            // Ensure only run once and handle memory leak in IE
            node.onload = node.onerror = node.onreadystatechange = undefined;
            if (mod.isCss) {
                mod.ok = true;
                delete mod.loading;
                callNext(call, [mod], []);
            } else {
                // Remove the script to reduce memory leak
                head.removeChild(node);
            }
            // Dereference the node
            node = undefined;
        };
        if (mod.isCss) {
            node.rel = 'stylesheet';
            node.href = realPath(mod);
        } else {
            node.async = true;
            node.src = realPath(mod);
        }
        mod.loading = true;
        head.appendChild(node);
    };

    // worker加载方法
    requireWorker = function (array, callback) {
        var i, arr = [];
        arr.length = array.length;
        for (i = array.length - 1; i >= 0; i -= 1) {
            arr[i] = realPath(array[i]);
        }
        importScripts.apply(self, arr);
        callback([]);
    };

    // 模块依赖方法
    depend = function (table, array, result) {
        var i, name, mod;
        for (i = array.length - 1; i >= 0; i -= 1) {
            name = array[i];
            mod = table[name];
            if (!mod) {
                throw ("config not found! module: " + name);
            }
            if ((mod.ok === undefined || mod.ok < okIndex) && index(mod, result) < 0) {
                result.push(mod);
                if (!mod.loading) {
                    if (!result.load) {
                        result.load = [];
                    }
                    result.load.push(mod);
                    depend(table, mod.loadDepend || [], result);
                    depend(table, mod.runDepend || [], result);
                }
            }
        }
        return result;
    };

    /**
     * 获得指定模块名的配置
     * @param  {string} name 模块名
     * @return {object} 指定模块名的配置
     */
    module.lookup = function (name) {
        return table[name];
    };

    /**
     * 模块加载方法，返回需要加载的模块数量
     * @param {array} array [模块名, ...]，需要加载的模块名数组
     * @param {function} callback 全部加载成功后的回调函数
     * @return {int} 需要加载的模块数量
     */
    module.require = function (array, callback) {
        var i, head, arr = depend(table, array, []);
        if (arr.length > 0) {
//			console.log(arr.map(function(item){return item.name}));
            if (self.document) {
                call.push(callback, arr);
                if (arr.load) {
                    head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
                    for (i = arr.load.length - 1; i >= 0; i -= 1) {
                        requireWindow(arr.load[i], head, document);
                    }
                }
            } else {
                requireWorker(arr.load, callback);
            }
        } else {
            callback([]);
        }
        return arr.length;
    };

    /**
     * 模块定义方法
     * @param {string} name 模块名
     * @param {function} factory 模块的定义函数
     */
    module.define = function (name, factory) {
        var mod = table[name],
            result;
        if (!mod) {
            throw ("undefined module: " + name);
        }
        if (!modCheck(table, mod)) {
            return wait.push(mod, factory);
        }
        modInit(mod, factory);
        result = [mod];
        // 检查等待模块数组上是否有可以进行初始化
        if (waitNext(table, wait, result)) {
            // 紧缩wait数组
            zipArray(wait);
        }
        // 通知回调数组
        return callNext(call, result, []);
    };

    /**
     * 设置模块表的方法
     * @param  {array} array
     * @param  {string} url
     */
    module.config = function (array, url, index) {
        var i, m1, m2, arr = parseUrl(url);

        if (index !== undefined) {
            okIndex = index;
        }
        for (i = array.length - 1; i >= 0; i -= 1) {
            m1 = array[i];
            if (m1.name && m1.path) {
                // 处理成绝对路径
                m1.path = absUrl(m1.path, arr[0], arr[1]);
                m2 = table[m1.name];
                if (m2) {
                    if (m1.level && ((!m2.level) || m1.level > m2.level)) {
                        m2.path = m1.path;
                        m2.crc = m1.crc;
                        m2.loadDepend = m1.loadDepend;
                        m2.runDepend = m1.runDepend;
                        m2.isCss = m1.isCss;
                        m2.charset = m1.charset;
                        m2.args = m1.args;
                    }
                } else {
                    table[m1.name] = m1;
                    list.push(m1);
                    // 添加全局域
                    m2 = m1.name.indexOf(".");
                    m2 = (m2 > 0) ? m1.name.slice(0, m2) : m1.name;
                    if (!self[m2]) {
                        self[m2] = {};
                    }
                    if (!global[m2]) {
                        global[m2] = self[m2];
                        global.push([m2, self[m2]]);
                    }
                }
            }
        }
    };

    /**
     * 获得全局域数组
     * @return {array} 全局域数组
     */
    module.global = function () {
        return global;
    };

    /**
     * 获得模块列表
     * @return {array} 全局域数组
     */
    module.list = function () {
        return list;
    };

    /**
     * 获得等待加载的数量
     * @return {array} 全局域数组
     */
    module.waitCount = function () {
        return wait.length;
    };

    module.getOkIndex = function () {
        return okIndex;
    };

    // 工具函数
    module.get = get;
    module.index = index;
    module.parseUrl = parseUrl;
    module.absUrl = absUrl;

    //调试使用
    module.call = call;
    module.wait = wait;
    module.table = table;

    xp.mod = module;
    return xp;
}(xp || {}));