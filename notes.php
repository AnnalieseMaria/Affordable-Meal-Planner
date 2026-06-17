<?php
include_once('include/init.php');

$comments = dbQuery("
	SELECT *
	FROM injection_test
")->fetchAll();

echo "<h1>View all comments</h1>";

foreach ($comments as $comment) {
    echo "
		<div><strong>(".htmlspecialchars($comment['name']).")</strong> ".htmlspecialchars($comment['comment'])."</div>
	";
}

//only apply html special char's when printing data, not when storing it in database,
//cause we still want to have access to the users unaltered input. 

if (isset($_POST['saveComment'])) {

    saveThisComment($_POST['name'], $_POST['comment']);

    header('Location:?');
    exit;
}
?>


<form action='' method='post'>
    <h2>Leave a comment</h2>

    Name: <input type='text' name='name' />
    <br /><br />

    Comment: <textarea name='comment' style='width:400px; height:100px;'></textarea>
    <br /><br />

    <input type='submit' name='saveComment' />
</form>