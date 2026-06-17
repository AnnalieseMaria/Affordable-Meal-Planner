<?php 
    include('include/init.php');
    echoHeader('loginPage');


    if(isset($_POST['username'])){ //basically saying the superglobal username was set/not null..
     $submittedUsername = $_POST['username'];
     $submittedPassword =  $_POST['password'];
        if($userInfo = getUserbyUsername($submittedUsername)){
            if(password_verify($submittedPassword, $userInfo['password_hash'])) { 
                header("Location: index.php");
                //key value pairs
                $_SESSION['userId'] = $userInfo['userId'];
                $_SESSION['userName'] = $userInfo['userName'];
            
                } else {
                echo " 
                <p>The password you entered is incorrect. Please try again</p>
                ";
            }
        }
    
    }

    
    echo " 
        <body>
        <div class='login-screen'>

        <form action=' ' method='POST'>
            <label for='username'>username:</label>
            <input type='text' id='username' name='username' required><br></br>

            <label for='password'>password:</label>
            <input type='password' id='password' name='password' required><br></br>

            <input type='submit' value='login' >
            
        </form>
        </div>
    ";


    debugOutput($_SESSION);
    echoFooter();
?>