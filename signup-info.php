<?php 
    include('include/init.php');
    echoHeader('loginPage');


    if(isset($_POST['username'])){ //basically saying the superglobal username was set/not null..
       
        $submittedUsername = $_POST['username'];
        $submittedPwd = $_POST['password'];

        userSignup($submittedUsername, $submittedPwd);

        $userInfo = getUserbyUsername($submittedUsername); //gets userId and name

        //key value pairs
        $_SESSION['userId'] = $userInfo['userId'];
        $_SESSION['userName'] = $userInfo['userName'];

        header("Location: index.php");
    }

    

    echo " 
        <body>
        <div class='login-screen'>

        <form action=' ' method='POST'>
            <label for='username'>username:</label>
            <input type='text' id='username' name='username' required><br></br>

            <label for='password'>password:</label>
            <input type='password' id='password' name='password' required><br></br>

            <input type='submit' value='sign up' >
            
        </form>
        </div>
    ";


    debugOutput($_SESSION);
    echoFooter();
?>