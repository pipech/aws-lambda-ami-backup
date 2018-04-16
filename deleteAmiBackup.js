let aws = require('aws-sdk');
aws.config.update({region: 'ap-southeast-1'});
let ec2 = new aws.EC2();

exports.handler = async function(event, context, callback) {

    const param = {
	    Filters: [
            {
            Name: 'tag:deleteDate',
            Values: [cal_date()]
            },
        ]
    };
	
    let ami_list = await list_ami(param);
	let deregister_image_return = await deregister_image_loop(ami_list);
	let delete_snapshot_return = await delete_snapshot_loop(ami_list);
	
	console.log(ami_list);
	console.log(deregister_image_return);
	console.log(delete_snapshot_return);
	
};

function list_ami(param) {
	return new Promise(function(resolve, reject) {
        ec2.describeImages(param, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
                resolve(data.Images);
            }
        });
    });
}

function deregister_image(image_params) {
    return new Promise(function(resolve, reject) {
        ec2.deregisterImage(image_params, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
                resolve(data);
            }
        });
    });
}

function deregister_image_loop(ami_list) { 
	return new Promise(function(resolve, reject) {
		let promises = [];
		for(let ami in ami_list) {
			let image = ami_list[ami];
			let image_params = {
				ImageId: image.ImageId,
			};
			promises.push(deregister_image(image_params));
		};
		Promise.all(promises)
			.then(function(results){
				resolve(results);
			})
			.catch(function(e){
				reject('Error : ' + e + e.stack);
			});
    });
}

function delete_snapshot(snapshot_params) {
	return new Promise(function(resolve, reject) {
        ec2.deleteSnapshot(snapshot_params, function(err, data) {
            if(err) {
                reject('Error : ' + err + err.stack);
            } else {
                resolve(data);
            }
        });
    });
}

function delete_snapshot_loop(ami_list) { 
	return new Promise(function(resolve, reject) {
		let promises = [];
		for(let ami in ami_list) {
			let image = ami_list[ami];
			let block_devices = image.BlockDeviceMappings
			for(let block_device in block_devices) {
				let device = block_devices[block_device];
				let snapshot_params = {
					SnapshotId: device.Ebs.SnapshotId,
				};
				promises.push(delete_snapshot(snapshot_params));
			}
		};
		Promise.all(promises)
			.then(function(results){
				resolve(results);
			})
			.catch(function(e){
				reject('Error : ' + e + e.stack);
			});
    });
}

function cal_date() {
	let date = new Date();
    let date_stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
	return date_stamp;
}
