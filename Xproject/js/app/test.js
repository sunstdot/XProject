
v.showPopUpBox = function () {
		var defaultTenet, roleInfo = app.plugin_mgr.get("getCharacterInfo", {
			id: m.playerSelfID,
			keys: ["level", "money"]
		});
		app.seqfun.start()
			.then(testSf.checkLevel, roleInfo.level)
			.then(testSf.checkMoney, roleInfo.money)
			.then(testSf.checkPosition, m.myMemberInfo.position)
			.done(function () {
				app.ui.promptBox.inputPromptBox("请输入你要创建的家族名称", "下一步", undefined, {
					inputType: "text",
					inputCallback: function (inputStr, callback) {
						app.seqfun.start()
							.then(testSf.checkLength, inputStr)
							.done(function () {
								defaultTenet = tenetCfg[Math.floor(tenetCfg.length * Math.random())];
								m.requestCreate(inputStr, defaultTenet, function (data) {
									if (data.error !== undefined) {
										app.message.showDialog(data.error, undefined, function () {
										});
									} else {
										m.brotherhoodName = inputStr;
										callback(true);
										app.message.showMessage("brotherhood_create_success", [inputStr]);
										v.editTenet(defaultTenet, "next");
									}
								});
							})
							.fail(function (arg) {
								app.message.showDialog(arg, undefined, function () {
								});
							})();
					}
				}, undefined);
			})
			.fail(function (arg) {
				app.message.showDialog(arg, undefined, function () {
				});
			})();
	};