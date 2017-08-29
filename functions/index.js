const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    admin.database().ref('/messages').push({original: original}).then(snapshot => {
      // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
      res.redirect(303, snapshot.ref);
    });
  });


  exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
  .onWrite(event => {
    const original = event.data.val();
    console.log("UpperCasing", event.params.pushId, original);
    const uppercase = original.toUpperCase();
    return event.data.ref.parent.child('uppercase').set(uppercase);
  });



//here we will add the push notifications to all the relevant professionals once the apn works. 
// exports.onOrderRequestReceived = functions.database.ref('/OrdersPros/{orderRequestId}')
// .onWrite(event => {
//     const snapshot = event.data;
    
// });



exports.incomingOrderRequest = functions.database.ref('/OrderRequest/{orderRequestId}')
.onWrite(event => {
    console.log(event.params);
    const snapshot = event.data;
    const uid = event.params.orderRequestId;
    console.log(event.data.val());
    const requestUserId = event.data.val().userId;
    let availablePros = [];
    let OrderReqPros =[];
    if(snapshot.previous.val())
        return;
    const OrderProsRef = event.data.ref.root.child('/OrdersPros/'+uid);

    admin.database().ref('professionals').once('value').then(professionals => {
        console.log("start professionals: ",professionals.val());
        if(professionals.val()){   
            console.log("professionals are: ",professionals.val())
            var proKeys  = Object.keys(professionals.val());
            var pros = Object.keys(professionals.val()).map(function(key){
                return professionals.val()[key];
            });

            pros.forEach((pro, index)=> {
                console.log(pro, index)
                    if(pro.status){
                        pro.key = proKeys[index];
                        availablePros.push(pro);
                    }
                });

                console.log("available pros:", availablePros);
          
        }else{
            console.log("no professionals available");
        }
    }).then(()=>{
        if(availablePros.length <= 0){
            console.log("Available Pros array is empty")
            return;
        }
        availablePros.forEach((aPro, index)=> {
            OrderReqPros.push({
                proId: aPro.key,
                proName: aPro.name || "john-doe",
                proRating: aPro.rating || 0,
                proImage: aPro.imageUrl || "",
                timestamp: new Date().toString(),
                userId : requestUserId
            });
        });
        return OrderProsRef.set(OrderReqPros);
    });
});
//need to change it to onCreate in real life app
exports.onProfessionalApprovedOrderRequest = functions.database.ref('OrderRequestApproved/{orderRequestId}')
.onWrite(event => {
    const snapshot = event.data;
    const dataVal = event.data.val();
    const orderRequestId = event.params.orderRequestId;
    console.log(orderRequestId, snapshot, dataVal);


});

exports.incomingOrderNotification = functions.database.ref('/OrdersPros/{orderRequestId}')
.onWrite(event => {
    const snapshot = event.data;
    const orderRequestId = event.params.orderRequestId;
    const proIds = event.data.val();
    console.log(proIds);
    let professionalIds = []
    let professionalPushTokens = []
    var promises = []
    proIds.forEach((res, index)=>{
        professionalIds.push(res.proId);
        promises.push(event.data.ref.root.child('professionals/'+res.proId).once('value').then(professionals => {
            if(professionals.val()){
                console.log("this is the professionals:", professionals.val())
                professionalPushTokens.push(professionals.val().pushToken);
            }
        }))
    });
    Promise.all(promises).then(()=>{
        console.log("professionalPushTokens are ", professionalPushTokens);
        const payLoad = {
            notification: {
                title:`this is a test notification`,
                body: 'This is a test notification sent by firebase cloud functions if you see this it means that I am awesome',
                click_action: `https://${functions.config().firebase.authDomain}/orderRequest/${orderRequestId}`
            }
        };
        // const tokens = Object.keys(professionalPushTokens);
        // console.log("this are the tokens ", tokens);
        return admin.messaging().sendToDevice(professionalPushTokens,payLoad).then(response =>{
            console.log("Successfully sent message:", response);                
        })
        .catch(function (error) {
            console.log("Error sending message:", error);
        });
        
    }); 
    console.log(event.data.val());
});


  exports.incomingOrderRequestNotification = functions.database.ref('/OrderPros/{orderRequestId}')
  .onWrite(event => {
        const snapshot = event.data;
        if(snapshot.previous.val())
            return;
        //Notification details
        const text = snapshot.val().text;
        const payLoad = {
            notification: {
                title:`${snapshot.val().name} posted ${text ? 'a message': 'an image'}`,
                body: text ? (text.length <= 100 ? text : text.substring(0, 97) + '...') : '',
                click_action: `https://${functions.config().firebase.authDomain}`
            }
        };

        return admin.database().ref('fcmTokens').once('value').then(allTokens => {
            if(allTokens.val()){
                const tokens = Object.keys(allTokens.val());
                return admin.messaging().sendToDevice(tokens,payLoad).then(response => {
                    const tokensToRemove = [];
                    response.results.forEach((result, index)=> {
                        const error = result.error;
                        if(error){
                            console.error('Failure sending notification to', tokens[index], error);
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                              tokensToRemove.push(allTokens.ref.child(tokens[index]).remove());
                            }
                        }
                    });
                    return Promise.all(tokensToRemove);
                });
            }
        });
  });

  function loadProfessionalsForPush(prosIds){
      let dbRef = admin.database().ref('/professionals');
      let defer = new Promise((resolve, reject)=> {
        dbRef.once('value', (snap)=>{
            let data = snap.val();
            let pros = [];
            for(var pro in data){
                pros.push(data)
            }
        });
      });
  }
