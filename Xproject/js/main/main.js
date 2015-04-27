var test = (function(){
	console.log("t\3333");
	app.uiElement.test.test();
}());

function testConfirm(){
	var name = document.getElementById("nameInput");
	var pwd = document.getElementById("pwdInput");
	if(name&&pwd){
		console.log(name+pwd);
		//向服务端发送消息
		app.connection.sendNetMsg({name:name,pwd:pwd});
	}
};